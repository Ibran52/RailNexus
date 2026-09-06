"""
bundling.py — RailNexus Brain / core
Post-planning bundle analysis to identify maintenance bundling opportunities.

A bundle opportunity occurs when two requests on the SAME exact section have
overlapping availability windows that can accommodate the combined duration of both
blocks.

NOTE (Phase 1):
Bundling is evaluated as a post-planning recommendation opportunity. It does NOT
alter the scheduled windows of individual requests unless explicitly adopted by the controller.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

from core.optimizer import SimulationResult, run_optimization
from core.train_repository import TrainRepository

logger = logging.getLogger(__name__)


@dataclass
class BundleEvaluation:
    bundle_id: str
    request_ids: List[str]
    section: str
    combined_start: datetime
    combined_end: datetime
    combined_duration_minutes: int
    bundle_impact_score: float
    individual_impact_sum: float
    recommendation: str  # "BUNDLE" | "SEPARATE"
    reason: str


def is_bundle_eligible(req_a: Any, req_b: Any) -> bool:
    """
    Check structural feasibility of combining two requests:
    1. Exact section match (from_station and to_station match).
    2. Overlapping availability: max(earliest_start) < min(latest_end).
    3. Intersection duration >= sum of individual durations.
    """
    if req_a.from_station != req_b.from_station or req_a.to_station != req_b.to_station:
        return False

    intersection_start = max(req_a.earliest_start, req_b.earliest_start)
    intersection_end = min(req_a.latest_end, req_b.latest_end)

    if intersection_start >= intersection_end:
        return False

    available_mins = (intersection_end - intersection_start).total_seconds() / 60
    combined_duration = req_a.duration_minutes + req_b.duration_minutes

    return available_mins >= combined_duration


def evaluate_bundle(
    req_a: Any,
    req_b: Any,
    individual_results: Dict[str, Optional[SimulationResult]],
    repo: TrainRepository,
    fixed_exclusions: Optional[List[Tuple[datetime, datetime]]] = None,
    step_minutes: int = 60,
) -> Optional[BundleEvaluation]:
    """
    Simulate the combined block for two eligible requests and compare
    its impact score against the sum of individual impact scores.
    """
    if not is_bundle_eligible(req_a, req_b):
        return None

    res_a = individual_results.get(req_a.request_id)
    res_b = individual_results.get(req_b.request_id)

    if res_a is None or res_b is None:
        return None

    individual_impact_sum = round(res_a.window.impact_score + res_b.window.impact_score, 4)

    intersection_start = max(req_a.earliest_start, req_b.earliest_start)
    intersection_end = min(req_a.latest_end, req_b.latest_end)
    combined_duration = req_a.duration_minutes + req_b.duration_minutes

    opt_result = run_optimization(
        repo=repo,
        from_station=req_a.from_station,
        to_station=req_a.to_station,
        earliest_start=intersection_start,
        latest_end=intersection_end,
        duration_minutes=combined_duration,
        step_minutes=step_minutes,
        fixed_exclusions=fixed_exclusions,
        request_priority=getattr(req_a, "priority", "MEDIUM"),
    )

    if not opt_result:
        return None

    best_combined, _ = opt_result
    bundle_impact = round(best_combined.window.impact_score, 4)

    if bundle_impact <= individual_impact_sum:
        recommendation = "BUNDLE"
        reason = (
            f"[PHASE 2 BUNDLE ESTIMATE] Combined block saves impact score ({bundle_impact:.2f} <= {individual_impact_sum:.2f}) "
            f"by combining {req_a.duration_minutes}m and {req_b.duration_minutes}m into a single window."
        )
    else:
        recommendation = "SEPARATE"
        reason = (
            f"[PHASE 2 BUNDLE ESTIMATE] Separate windows have lower total impact ({individual_impact_sum:.2f} < {bundle_impact:.2f})."
        )

    bundle_id = f"BUNDLE-{req_a.from_station}-{req_a.to_station}-{req_a.request_id[-4:]}_{req_b.request_id[-4:]}"

    return BundleEvaluation(
        bundle_id=bundle_id,
        request_ids=[req_a.request_id, req_b.request_id],
        section=f"{req_a.from_station} -> {req_a.to_station}",
        combined_start=best_combined.window.start,
        combined_end=best_combined.window.end,
        combined_duration_minutes=combined_duration,
        bundle_impact_score=bundle_impact,
        individual_impact_sum=individual_impact_sum,
        recommendation=recommendation,
        reason=reason,
    )


def find_bundle_candidates(
    requests: Sequence[Any],
    individual_results: Dict[str, Optional[SimulationResult]],
    repo: TrainRepository,
    fixed_exclusions_by_section: Optional[Dict[str, List[Tuple[datetime, datetime]]]] = None,
    step_minutes: int = 60,
) -> List[BundleEvaluation]:
    """
    Examine all pairs among requests on the same section and evaluate bundling opportunities.
    """
    bundles: List[BundleEvaluation] = []
    n = len(requests)
    for i in range(n):
        for j in range(i + 1, n):
            req_a = requests[i]
            req_b = requests[j]
            sec_key = f"{req_a.from_station}_{req_a.to_station}"
            exclusions = (
                fixed_exclusions_by_section.get(sec_key, [])
                if fixed_exclusions_by_section
                else None
            )
            evaluation = evaluate_bundle(
                req_a=req_a,
                req_b=req_b,
                individual_results=individual_results,
                repo=repo,
                fixed_exclusions=exclusions,
                step_minutes=step_minutes,
            )
            if evaluation:
                bundles.append(evaluation)

    return bundles
