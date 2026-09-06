"""
joint_planner.py — RailNexus Brain / core
Joint optimization engine for dynamic multi-request maintenance planning.

Solves the joint scheduling problem across N pending requests in the planning state
while respecting immoveable fixed plans (APPROVED/SCHEDULED).

Phase 3 Architectural Principles (PHASE_3_ADDITIVE_JOINT_SCORING):
1. Mutual Exclusion: Requests on the SAME exact section cannot overlap in time.
2. Immoveable Exclusions: Approved/scheduled plans on a section cannot be overlapped.
3. Global Objective: Total impact = sum of per-candidate Phase 3 impact scores.
   NOTE (PHASE_3_ADDITIVE_JOINT_SCORING): Uses additive per-candidate configured simulation scores
   and does not perform state-coupled re-simulation across concurrent maintenance windows.
4. Topology Scope: Conflict detection evaluates identical (from_station, to_station)
   block sections. Full network topology (shared corridors, upstream/downstream cascading)
   is deferred to network graph integration.
5. Tractability:
   - N <= JOINT_PLANNING_CAP (default 5): Full Cartesian joint optimization.
   - N > JOINT_PLANNING_CAP or no mutual Cartesian fit: Priority-based greedy fallback.
"""

from __future__ import annotations

import itertools
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

from config import JOINT_PLANNING_CAP, MAX_CANDIDATES_JOINT
from core.bundling import BundleEvaluation, find_bundle_candidates
from core.candidate_windows import CandidateWindow, generate_candidate_windows
from core.optimizer import SimulationResult, simulate_window
from core.train_repository import TrainRepository

logger = logging.getLogger(__name__)

PRIORITY_WEIGHTS: Dict[str, int] = {
    "CRITICAL": 0,
    "HIGH": 1,
    "MEDIUM": 2,
    "LOW": 3,
}


@dataclass
class PlannerResult:
    """Consolidated outcome of the joint planning run."""
    per_request_results: Dict[str, Optional[SimulationResult]]
    per_request_alternatives: Dict[str, List[SimulationResult]]
    best_combination: List[Tuple[str, CandidateWindow]]
    total_impact_score: float
    total_direct_delay_minutes: float
    total_conflicts: int
    total_affected_trains: int
    bundle_candidates: List[BundleEvaluation]
    algorithm_used: str  # "JOINT_OPTIMAL" | "GREEDY_FALLBACK" | "SINGLE"
    infeasible_request_ids: List[str]
    plan_alternatives: List[Dict[str, Any]] = field(default_factory=list)


def _to_naive_dt(dt: datetime) -> datetime:
    if hasattr(dt, "tzinfo") and dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt


def _intervals_overlap(start1: datetime, end1: datetime, start2: datetime, end2: datetime) -> bool:
    """Strict time interval overlap (touching boundary is allowed)."""
    s1, e1 = _to_naive_dt(start1), _to_naive_dt(end1)
    s2, e2 = _to_naive_dt(start2), _to_naive_dt(end2)
    return max(s1, s2) < min(e1, e2)



def _section_key(from_station: str, to_station: str) -> str:
    return f"{from_station.strip().upper()}_{to_station.strip().upper()}"


def joint_plan(
    all_pending: Sequence[Any],
    fixed_plans: Sequence[Any],
    repo: TrainRepository,
    step_minutes: int = 60,
    joint_cap: int = JOINT_PLANNING_CAP,
    max_candidates_joint: int = MAX_CANDIDATES_JOINT,
) -> PlannerResult:
    """
    Perform joint scheduling across all pending requests.

    Parameters:
    - all_pending: List of requests (PendingRequestItem or AnalyzeRequest)
    - fixed_plans: List of FixedPlanItem
    - repo: TrainRepository instance
    - step_minutes: sliding window step
    - joint_cap: max request count for Cartesian product
    - max_candidates_joint: candidate window limit per request in joint mode
    """
    if not all_pending:
        return PlannerResult(
            per_request_results={},
            per_request_alternatives={},
            best_combination=[],
            total_impact_score=0.0,
            total_direct_delay_minutes=0.0,
            total_conflicts=0,
            total_affected_trains=0,
            bundle_candidates=[],
            algorithm_used="SINGLE",
            infeasible_request_ids=[],
            plan_alternatives=[],
        )

    # 1. Group fixed plan exclusions by section
    fixed_exclusions_by_section: Dict[str, List[Tuple[datetime, datetime]]] = {}
    for fp in fixed_plans:
        skey = _section_key(fp.from_station, fp.to_station)
        fixed_exclusions_by_section.setdefault(skey, []).append(
            (fp.allocated_start, fp.allocated_end)
        )

    # 2. Candidate generation & simulation per request
    candidates_by_req: Dict[str, List[SimulationResult]] = {}
    infeasible_request_ids: List[str] = []

    for req in all_pending:
        skey = _section_key(req.from_station, req.to_station)
        exclusions = fixed_exclusions_by_section.get(skey, [])

        windows = generate_candidate_windows(
            earliest_start=req.earliest_start,
            latest_end=req.latest_end,
            duration_minutes=req.duration_minutes,
            step_minutes=step_minutes,
        )

        # Filter against fixed exclusions
        valid_windows: List[CandidateWindow] = []
        for w in windows:
            if not any(_intervals_overlap(w.start, w.end, ex_start, ex_end) for ex_start, ex_end in exclusions):
                valid_windows.append(w)

        if not valid_windows:
            logger.warning("No feasible candidate windows for request %s", req.request_id)
            infeasible_request_ids.append(req.request_id)
            candidates_by_req[req.request_id] = []
            continue

        # Cap candidates in joint mode for tractability if requested
        if len(all_pending) > 1 and len(valid_windows) > max_candidates_joint:
            valid_windows = valid_windows[:max_candidates_joint]

        sim_results: List[SimulationResult] = [
            simulate_window(
                w,
                repo,
                req.from_station,
                req.to_station,
                request_priority=getattr(req, "priority", "MEDIUM"),
            )
            for w in valid_windows
        ]

        # Discard infeasible windows (e.g. section already occupied at block start)
        feasible_sims = [s for s in sim_results if s.window.feasible]

        if not feasible_sims:
            logger.warning("All candidate windows infeasible for request %s", req.request_id)
            infeasible_request_ids.append(req.request_id)
            candidates_by_req[req.request_id] = []
            continue

        # Sort candidate windows: lowest impact score first, then earliest start
        feasible_sims.sort(key=lambda r: (r.window.impact_score, r.window.start))
        candidates_by_req[req.request_id] = feasible_sims

    schedulable_requests = [r for r in all_pending if r.request_id not in infeasible_request_ids]

    per_request_results: Dict[str, Optional[SimulationResult]] = {}
    per_request_alternatives: Dict[str, List[SimulationResult]] = {}
    plan_alternatives: List[Dict[str, Any]] = []
    algorithm_used = "JOINT_OPTIMAL"

    if len(schedulable_requests) == 1:
        # Single request path
        algorithm_used = "SINGLE"
        single_req = schedulable_requests[0]
        sims = candidates_by_req[single_req.request_id]
        best_sim = sims[0]
        per_request_results[single_req.request_id] = best_sim

    elif 1 < len(schedulable_requests) <= joint_cap:
        # Cartesian product search across candidate combinations
        req_candidate_lists = [candidates_by_req[r.request_id] for r in schedulable_requests]
        feasible_combinations: List[Tuple[float, datetime, Tuple[SimulationResult, ...]]] = []

        for combo in itertools.product(*req_candidate_lists):
            # Check mutual non-overlap for requests sharing the exact same section
            mutually_feasible = True
            for i in range(len(schedulable_requests)):
                for j in range(i + 1, len(schedulable_requests)):
                    req_i = schedulable_requests[i]
                    req_j = schedulable_requests[j]
                    if _section_key(req_i.from_station, req_i.to_station) == _section_key(req_j.from_station, req_j.to_station):
                        if _intervals_overlap(combo[i].window.start, combo[i].window.end, combo[j].window.start, combo[j].window.end):
                            mutually_feasible = False
                            break
                if not mutually_feasible:
                    break

            if mutually_feasible:
                combo_impact = sum(sim.window.impact_score for sim in combo)
                combo_start = min(sim.window.start for sim in combo)
                feasible_combinations.append((combo_impact, combo_start, combo))

        if feasible_combinations:
            # Sort: lowest total impact score ASC, then earliest collective start ASC
            feasible_combinations.sort(key=lambda item: (item[0], item[1]))
            _, _, best_combo = feasible_combinations[0]
            algorithm_used = "JOINT_OPTIMAL"

            for req, sim in zip(schedulable_requests, best_combo):
                per_request_results[req.request_id] = sim

            # Collect runner-up complete plan combinations
            if len(feasible_combinations) > 1:
                for alt_idx, (alt_impact, _, alt_combo) in enumerate(feasible_combinations[1:4], start=1):
                    plan_alternatives.append({
                        "plan_alternative_id": f"ALT-{alt_idx:03d}",
                        "recommendations": [
                            {
                                "request_id": r.request_id,
                                "start": s.window.start.isoformat(),
                                "end": s.window.end.isoformat(),
                            }
                            for r, s in zip(schedulable_requests, alt_combo)
                        ],
                        "overall_impact_score": round(alt_impact, 4),
                    })
        else:
            # No mutually feasible Cartesian combination: trigger greedy fallback
            algorithm_used = "GREEDY_FALLBACK"

    if len(schedulable_requests) > joint_cap or (len(schedulable_requests) > 1 and algorithm_used == "GREEDY_FALLBACK"):
        algorithm_used = "GREEDY_FALLBACK"
        # Sort requests by operational priority, then earliest start
        sorted_requests = sorted(
            schedulable_requests,
            key=lambda r: (
                PRIORITY_WEIGHTS.get(getattr(r, "priority", "MEDIUM"), 2),
                r.earliest_start,
            ),
        )

        occupied_intervals_by_sec: Dict[str, List[Tuple[datetime, datetime]]] = {
            k: list(v) for k, v in fixed_exclusions_by_section.items()
        }

        for req in sorted_requests:
            skey = _section_key(req.from_station, req.to_station)
            occupied = occupied_intervals_by_sec.setdefault(skey, [])

            selected_sim: Optional[SimulationResult] = None
            sims = candidates_by_req[req.request_id]

            for candidate_sim in sims:
                w = candidate_sim.window
                if not any(_intervals_overlap(w.start, w.end, occ_start, occ_end) for occ_start, occ_end in occupied):
                    selected_sim = candidate_sim
                    break

            if selected_sim is not None:
                per_request_results[req.request_id] = selected_sim
                occupied.append((selected_sim.window.start, selected_sim.window.end))
            else:
                logger.warning("Greedy fallback could not fit request %s without overlap", req.request_id)
                infeasible_request_ids.append(req.request_id)
                per_request_results[req.request_id] = None

    # ── Joint-Feasible Alternatives Generation ───────────────────────────────
    for req in schedulable_requests:
        selected_sim = per_request_results.get(req.request_id)
        if selected_sim is None:
            per_request_alternatives[req.request_id] = []
            continue

        req_skey = _section_key(req.from_station, req.to_station)
        fp_exclusions = fixed_exclusions_by_section.get(req_skey, [])

        # Windows of other scheduled requests on the exact same section
        other_selected_windows_same_section = []
        for other in schedulable_requests:
            if other.request_id != req.request_id and _section_key(other.from_station, other.to_station) == req_skey:
                other_res = per_request_results.get(other.request_id)
                if other_res is not None:
                    other_selected_windows_same_section.append(other_res.window)


        joint_feasible_alts: List[SimulationResult] = []
        for cand_sim in candidates_by_req.get(req.request_id, []):
            cw = cand_sim.window

            # 1. Skip the selected window
            if cw.start == selected_sim.window.start and cw.end == selected_sim.window.end:
                continue

            # 2. Skip individually infeasible windows
            if not cw.feasible:
                continue

            # 3. Skip windows overlapping fixed plans on this section
            if any(_intervals_overlap(cw.start, cw.end, fp_start, fp_end) for fp_start, fp_end in fp_exclusions):
                continue

            # 4. Skip windows overlapping other selected requests on this section
            if any(_intervals_overlap(cw.start, cw.end, ow.start, ow.end) for ow in other_selected_windows_same_section):
                continue

            joint_feasible_alts.append(cand_sim)

        per_request_alternatives[req.request_id] = joint_feasible_alts

    # Map infeasible requests to None
    for req_id in infeasible_request_ids:
        per_request_results[req_id] = None
        per_request_alternatives[req_id] = []

    # Aggregate overall metrics
    best_combination: List[Tuple[str, CandidateWindow]] = []
    total_impact_score = 0.0
    total_direct_delay_minutes = 0.0
    total_conflicts = 0
    all_affected_trains: set[int] = set()

    for req_id, sim in per_request_results.items():
        if sim is not None:
            best_combination.append((req_id, sim.window))
            total_impact_score += sim.window.impact_score
            total_direct_delay_minutes += sim.window.direct_delay_minutes
            total_conflicts += sim.window.conflict_count
            all_affected_trains.update(sim.window.affected_trains)

    # 3. Post-planning bundle analysis
    bundle_candidates = find_bundle_candidates(
        requests=all_pending,
        individual_results=per_request_results,
        repo=repo,
        fixed_exclusions_by_section=fixed_exclusions_by_section,
        step_minutes=step_minutes,
    )

    return PlannerResult(
        per_request_results=per_request_results,
        per_request_alternatives=per_request_alternatives,
        best_combination=best_combination,
        total_impact_score=round(total_impact_score, 4),
        total_direct_delay_minutes=round(total_direct_delay_minutes, 4),
        total_conflicts=total_conflicts,
        total_affected_trains=len(all_affected_trains),
        bundle_candidates=bundle_candidates,
        algorithm_used=algorithm_used,
        infeasible_request_ids=sorted(set(infeasible_request_ids)),
        plan_alternatives=plan_alternatives,
    )
