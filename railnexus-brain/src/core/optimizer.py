"""
optimizer.py — RailNexus Brain / core
Runs the full simulation over all candidate windows and selects the best one.

Algorithm (Phase 1 — deterministic):
  1. For each candidate window:
     a. Fetch trains on the section that overlap the window.
     b. Build ConflictRecords.
     c. Compute direct_delay.
     d. Compute cascade_delay (returns 0 + NOT_IMPLEMENTED status).
     e. Compute impact_score.
  2. Sort by (impact_score ASC, start ASC) for deterministic tie-breaking.
  3. Return the winner and the full ranked list.

RULES:
  - No LLM. No ML model. No hardcoded result.
  - Deterministic output for identical input.
  - cascade_delay always 0 + NOT_IMPLEMENTED in Phase 1.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from core.candidate_windows import CandidateWindow, generate_candidate_windows
from core.cascade_delay import calculate_cascade_delay, simulate_cascade_delay
from core.conflict_engine import ConflictRecord, find_conflicts
from core.direct_delay import calculate_total_direct_delay
from core.impact_score import ScoreResult, compute_impact_score
from core.train_repository import TrainRepository
from core.train_sequence import TrainSequenceRepository

logger = logging.getLogger(__name__)


@dataclass
class SimulationResult:
    """Full simulation output for one candidate window."""
    window: CandidateWindow
    conflicts: List[ConflictRecord]
    cascade_status: str


def simulate_window(
    window: CandidateWindow,
    repo: TrainRepository,
    from_station: str,
    to_station: str,
    sequence_repo: Optional[TrainSequenceRepository] = None,
    request_priority: str = "MEDIUM",
) -> SimulationResult:
    """
    Run the full simulation pipeline for a single candidate *window*.
    Populates all metrics and feasibility fields on the window in place.

    A window is INFEASIBLE if any train is already occupying the section
    when the block begins (TRAIN_ALREADY_INSIDE_SECTION).
    """
    # 1. Fetch matching trains from repository
    trains = repo.get_trains_for_section_and_time(
        from_station=from_station,
        to_station=to_station,
        start_time=window.start,
        end_time=window.end,
    )

    # 2. Detect conflicts
    conflicts = find_conflicts(window, trains)

    # 3. Conflict breakdown & feasibility classification
    entry_block_count = sum(
        1 for c in conflicts if c.conflict_type.value == "ENTRY_BLOCKED"
    )
    already_occupied_count = sum(
        1 for c in conflicts if c.conflict_type.value == "TRAIN_ALREADY_INSIDE_SECTION"
    )

    window.conflict_count = len(conflicts)
    window.blocking_conflict_count = len(conflicts)
    window.entry_block_count = entry_block_count
    window.already_occupied_count = already_occupied_count
    window.affected_trains = sorted({c.train_number for c in conflicts})

    cascade_status = "NOT_IMPLEMENTED"

    if already_occupied_count > 0:
        window.feasible = False
        window.infeasibility_reasons = [
            {
                "code": "TRAIN_ALREADY_OCCUPYING_SECTION_AT_BLOCK_START",
                "train_number": c.train_number,
            }
            for c in conflicts
            if c.conflict_type.value == "TRAIN_ALREADY_INSIDE_SECTION"
        ]
        window.direct_delay_minutes = 0.0
        window.cascade_delay_minutes = 0.0
        window.propagated_delay_minutes = 0.0
        window.secondary_delay_minutes = 0.0
        window.total_delay_minutes = 0.0
        window.cascade_status = "NOT_IMPLEMENTED"
        window.cascade_notes = "Infeasible window — simulation halted."
        window.delay_trace = []
        window.impact_score = float("inf")
        window.score_breakdown = []
    else:
        window.feasible = True
        window.infeasibility_reasons = []
        window.direct_delay_minutes = calculate_total_direct_delay(window, conflicts)

        seq_repo = sequence_repo or getattr(repo, "sequence_repo", None)
        if seq_repo is not None:
            cascade_result = simulate_cascade_delay(window, conflicts, seq_repo)
            window.cascade_delay_minutes = cascade_result.cascade_delay_minutes
            window.propagated_delay_minutes = cascade_result.propagated_delay_minutes
            window.secondary_delay_minutes = cascade_result.secondary_delay_minutes
            window.total_delay_minutes = cascade_result.total_delay_minutes
            window.cascade_status = cascade_result.status
            window.cascade_notes = cascade_result.notes
            window.delay_trace = [t.to_dict() for t in cascade_result.trace]
            window.cascade_reason = cascade_result.structured_reason
            cascade_status = cascade_result.status
        else:
            cascade_result = calculate_cascade_delay(window, conflicts)
            window.cascade_delay_minutes = cascade_result.cascade_delay_minutes
            window.propagated_delay_minutes = 0.0
            window.secondary_delay_minutes = 0.0
            window.total_delay_minutes = window.direct_delay_minutes
            window.cascade_status = cascade_result.status
            window.cascade_notes = cascade_result.notes
            window.delay_trace = []
            window.cascade_reason = None
            cascade_status = cascade_result.status

        score_result: ScoreResult = compute_impact_score(
            window,
            repo=repo,
            request_priority=request_priority,
            conflicts=conflicts,
        )
        window.impact_score = score_result.total_score
        window.score_breakdown = [b.to_dict() for b in score_result.breakdown]

    return SimulationResult(
        window=window,
        conflicts=conflicts,
        cascade_status=cascade_status,
    )


def run_optimization(
    repo: TrainRepository,
    from_station: str,
    to_station: str,
    earliest_start,
    latest_end,
    duration_minutes: int,
    step_minutes: int = 60,
    fixed_exclusions: Optional[List[tuple[datetime, datetime]]] = None,
    sequence_repo: Optional[TrainSequenceRepository] = None,
    request_priority: str = "MEDIUM",
) -> Optional[tuple[SimulationResult, List[SimulationResult]]]:
    """
    Generate + simulate all candidate windows, return (best, feasible_results).

    - Discards windows overlapping fixed exclusions.
    - Simulates each candidate and evaluates feasibility.
    - Discards infeasible candidates (e.g. section already occupied at block start).
    - Returns None if no feasible window can be found.
    """
    windows = generate_candidate_windows(
        earliest_start=earliest_start,
        latest_end=latest_end,
        duration_minutes=duration_minutes,
        step_minutes=step_minutes,
    )

    if fixed_exclusions:
        valid_windows = []
        for w in windows:
            overlaps = False
            for ex_start, ex_end in fixed_exclusions:
                if max(w.start, ex_start) < min(w.end, ex_end):
                    overlaps = True
                    break
            if not overlaps:
                valid_windows.append(w)
        windows = valid_windows

    if not windows:
        logger.warning(
            "No candidate windows generated for %s→%s (%d min in %s–%s)",
            from_station, to_station, duration_minutes, earliest_start, latest_end,
        )
        return None

    results: List[SimulationResult] = []
    for window in windows:
        result = simulate_window(
            window,
            repo,
            from_station,
            to_station,
            sequence_repo=sequence_repo,
            request_priority=request_priority,
        )
        results.append(result)
        logger.debug(
            "Window %s–%s | feasible=%s | conflicts=%d | direct_delay=%.2f | score=%.2f",
            window.start.strftime("%H:%M"), window.end.strftime("%H:%M"),
            window.feasible, window.conflict_count, window.direct_delay_minutes, window.impact_score,
        )

    # Filter: Discard infeasible candidates
    feasible_results = [r for r in results if r.window.feasible]

    if not feasible_results:
        logger.warning(
            "All %d candidate windows infeasible for %s→%s (%d min in %s–%s)",
            len(results), from_station, to_station, duration_minutes, earliest_start, latest_end,
        )
        return None

    # Sort feasible: lowest score first, then earliest start (deterministic tie-break)
    sorted_results = sorted(
        feasible_results,
        key=lambda r: (r.window.impact_score, r.window.start),
    )

    best = sorted_results[0]
    logger.info(
        "Best feasible window: %s–%s | score=%.2f | conflicts=%d",
        best.window.start, best.window.end,
        best.window.impact_score, best.window.conflict_count,
    )

    return best, sorted_results

