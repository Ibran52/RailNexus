"""
brain_service.py — RailNexus Brain / services
Orchestrates the full analysis pipeline for a maintenance request.

This layer is the only place that calls core modules.
FastAPI routes call brain_service — NOT core modules directly.

Flow:
  AnalyzeRequest
    → validate section exists in dataset
    → run_optimization  (candidate_windows → simulate each → score)
    → generate explanation
    → build AnalyzeResponse
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from api.schemas import (
    AlternativeSchema,
    AnalyzeRequest,
    AnalyzeResponse,
    BundleCandidate,
    ConflictSchema,
    DelayTraceItem,
    MetadataSchema,
    MetricsSchema,
    OverallMetricsSchema,
    PendingRequestItem,
    PlanAlternative,
    PlanAlternativeItem,
    PlanItemRecommendation,
    PlanningSummarySchema,
    RecommendationSchema,
    RequestStatus,
    ScoreBreakdownItemSchema,
)
import config
from config import (
    ALGORITHM_VERSION,
    DATASET_VERSION,
    DEFAULT_WINDOW_STEP_MINUTES,
    NOT_IMPLEMENTED,
    SCORING_VERSION,
    SERVICE_VERSION,
)
from core.bundling import BundleEvaluation
from core.explanation import generate_explanation
from core.joint_planner import PlannerResult, joint_plan
from core.optimizer import SimulationResult, run_optimization
from core.train_repository import TrainRepository

logger = logging.getLogger(__name__)


class BrainService:
    """
    Stateless analysis service.

    One instance is created at startup and injected into the FastAPI routes.
    The repository holds the dataset; maintenance requests are never stored.
    """

    def __init__(self, repo: TrainRepository) -> None:
        self._repo = repo

    def analyze(
        self,
        request: AnalyzeRequest,
        trace_id: str,
    ) -> AnalyzeResponse:
        """
        Run the Brain pipeline and return a structured response.
        If planning_state is omitted, executes single-request optimization.
        If planning_state is provided, executes joint optimization across all requests.
        """
        if request.planning_state is None:
            return self._analyze_single(request, trace_id)
        else:
            return self._analyze_with_planning_state(request, trace_id)

    def _analyze_single(
        self,
        request: AnalyzeRequest,
        trace_id: str,
    ) -> AnalyzeResponse:
        brain_run_id = str(uuid.uuid4())
        logger.info(
            "[%s] Analyzing REQ=%s | section=%s→%s | duration=%d min",
            trace_id, request.request_id,
            request.from_station, request.to_station,
            request.duration_minutes,
        )

        # ── 1. Check section exists ───────────────────────────────────────
        if not self._repo.section_exists(request.from_station, request.to_station):
            logger.warning(
                "[%s] Section %s→%s not found in dataset.",
                trace_id, request.from_station, request.to_station,
            )
            return self._no_section_response(request, brain_run_id, trace_id)

        # ── 2. Run optimization ───────────────────────────────────────────
        result = run_optimization(
            repo=self._repo,
            from_station=request.from_station,
            to_station=request.to_station,
            earliest_start=request.earliest_start,
            latest_end=request.latest_end,
            duration_minutes=request.duration_minutes,
            step_minutes=DEFAULT_WINDOW_STEP_MINUTES,
            request_priority=request.priority,
        )

        if result is None:
            return self._no_window_response(request, brain_run_id, trace_id)

        best_sim, all_sims = result

        # ── 3. Build explanation ──────────────────────────────────────────
        explanation = generate_explanation(
            best_window=best_sim.window,
            conflicts=best_sim.conflicts,
            all_windows=[s.window for s in all_sims],
            from_station=request.from_station,
            to_station=request.to_station,
            duration_minutes=request.duration_minutes,
        )

        # ── 4. Build conflict list ────────────────────────────────────────
        conflict_schemas = [
            ConflictSchema(
                train_number=c.train_number,
                train_type=c.train_type,
                from_station=c.from_station,
                to_station=c.to_station,
                train_entry=c.train_entry.isoformat(),
                train_exit=c.train_exit.isoformat(),
                overlap_minutes=c.overlap_minutes,
                conflict_type=c.conflict_type.value,
            )
            for c in best_sim.conflicts
        ]

        # ── 5. Build alternatives (top 5 other windows, excluding best) ───
        alternatives = [
            AlternativeSchema(
                start=s.window.start.isoformat(),
                end=s.window.end.isoformat(),
                conflict_count=s.window.conflict_count,
                direct_delay_minutes=s.window.direct_delay_minutes,
                impact_score=s.window.impact_score,
                alternative_type="SINGLE_REQUEST_ALTERNATIVE",
            )
            for s in all_sims[1:6]      # skip best, show up to 5 runners-up
        ]

        bw = best_sim.window
        score_breakdown = (
            [ScoreBreakdownItemSchema(**b) for b in bw.score_breakdown]
            if getattr(bw, "score_breakdown", None)
            else None
        )

        return AnalyzeResponse(
            success=True,
            brain_run_id=brain_run_id,
            request_id=request.request_id,
            status="ANALYZED",
            recommendation=RecommendationSchema(
                start=bw.start.isoformat(),
                end=bw.end.isoformat(),
                impact_score=bw.impact_score,
                score_breakdown=score_breakdown,
            ),
            metrics=MetricsSchema(
                conflict_count=bw.conflict_count,
                affected_train_count=len(bw.affected_trains),
                direct_delay_minutes=bw.direct_delay_minutes,
                cascade_delay_minutes=bw.cascade_delay_minutes,
                total_delay_minutes=bw.total_delay_minutes if bw.total_delay_minutes > 0.0 or bw.cascade_status == "PHASE_2_DETERMINISTIC" else bw.direct_delay_minutes,
                blocking_conflict_count=bw.blocking_conflict_count,
                entry_block_count=bw.entry_block_count,
                already_occupied_count=bw.already_occupied_count,
                propagated_delay_minutes=bw.propagated_delay_minutes,
                secondary_delay_minutes=bw.secondary_delay_minutes,
            ),
            conflicts=conflict_schemas,
            alternatives=alternatives,
            explanation=explanation,
            metadata=MetadataSchema(
                request_id=request.request_id,
                brain_run_id=brain_run_id,
                trace_id=trace_id,
                dataset_version=DATASET_VERSION,
                algorithm_version=ALGORITHM_VERSION,
                cascade_simulation=bw.cascade_status if bw.cascade_status != "NOT_IMPLEMENTED" else NOT_IMPLEMENTED,
                cascade_reason=getattr(bw, "cascade_reason", None),
                candidate_windows_evaluated=len(all_sims),
                window_step_minutes=DEFAULT_WINDOW_STEP_MINUTES,
                scoring_version=SCORING_VERSION,
            ),
            delay_trace=[DelayTraceItem(**t) for t in bw.delay_trace] if bw.delay_trace else None,
            score_breakdown=score_breakdown,
        )

    def _analyze_with_planning_state(
        self,
        request: AnalyzeRequest,
        trace_id: str,
    ) -> AnalyzeResponse:
        brain_run_id = str(uuid.uuid4())
        planning_state = request.planning_state
        assert planning_state is not None

        # ── 1. Check triggering section exists ────────────────────────────
        if not self._repo.section_exists(request.from_station, request.to_station):
            logger.warning(
                "[%s] Section %s→%s not found in dataset.",
                trace_id, request.from_station, request.to_station,
            )
            return self._no_section_response(request, brain_run_id, trace_id)

        # ── 2. Deduplicate requests & filter inactive ─────────────────────
        # Filter out COMPLETED, REJECTED, CANCELLED
        inactive_statuses = {
            RequestStatus.COMPLETED,
            RequestStatus.REJECTED,
            RequestStatus.CANCELLED,
            "COMPLETED",
            "REJECTED",
            "CANCELLED",
        }
        active_pending = [
            p for p in planning_state.pending_requests
            if (p.status.value if isinstance(p.status, RequestStatus) else str(p.status or "PENDING")).upper() not in inactive_statuses
        ]

        # Merge triggering request (takes precedence if already in pending list)
        req_map: Dict[str, Any] = {p.request_id: p for p in active_pending}
        req_map[request.request_id] = PendingRequestItem(
            request_id=request.request_id,
            from_station=request.from_station,
            to_station=request.to_station,
            duration_minutes=request.duration_minutes,
            earliest_start=request.earliest_start,
            latest_end=request.latest_end,
            priority=request.priority,
            status=RequestStatus.PENDING,
        )
        all_pending = list(req_map.values())
        fixed_plans = planning_state.fixed_plans

        # ── 3. Plan version (Backend-owned or deterministic fallback) ──────
        if planning_state.version is not None:
            plan_version = planning_state.version
        else:
            plan_version = len(all_pending) + len(fixed_plans)

        logger.info(
            "[%s] Joint Planning | REQ=%s | mode=%s | pending=%d | fixed=%d | plan_v=%d",
            trace_id, request.request_id, planning_state.planning_mode,
            len(all_pending), len(fixed_plans), plan_version,
        )

        # ── 4. Execute joint planner ──────────────────────────────────────
        planner_result = joint_plan(
            all_pending=all_pending,
            fixed_plans=fixed_plans,
            repo=self._repo,
            step_minutes=DEFAULT_WINDOW_STEP_MINUTES,
        )

        # ── 5. Triggering request result (Backward compatibility fields) ───
        best_sim = planner_result.per_request_results.get(request.request_id)
        all_sims = (
            [best_sim] + planner_result.per_request_alternatives.get(request.request_id, [])
            if best_sim else []
        )

        if best_sim is None:
            status = "NO_FEASIBLE_WINDOW"
            recommendation = None
            metrics = self._empty_metrics()
            conflicts: List[ConflictSchema] = []
            alternatives: List[AlternativeSchema] = []
            explanation = (
                f"No feasible {request.duration_minutes}-minute window could be "
                f"allocated for request {request.request_id} on section "
                f"{request.from_station}→{request.to_station} without conflicting with "
                f"fixed plans or concurrent maintenance blocks."
            )
        else:
            status = "ANALYZED"
            bw = best_sim.window
            score_breakdown = (
                [ScoreBreakdownItemSchema(**b) for b in bw.score_breakdown]
                if getattr(bw, "score_breakdown", None)
                else None
            )
            recommendation = RecommendationSchema(
                start=bw.start.isoformat(),
                end=bw.end.isoformat(),
                impact_score=bw.impact_score,
                score_breakdown=score_breakdown,
            )
            metrics = MetricsSchema(
                conflict_count=bw.conflict_count,
                affected_train_count=len(bw.affected_trains),
                direct_delay_minutes=bw.direct_delay_minutes,
                cascade_delay_minutes=bw.cascade_delay_minutes,
                total_delay_minutes=bw.total_delay_minutes if bw.total_delay_minutes > 0.0 or bw.cascade_status == "PHASE_2_DETERMINISTIC" else bw.direct_delay_minutes,
                blocking_conflict_count=bw.blocking_conflict_count,
                entry_block_count=bw.entry_block_count,
                already_occupied_count=bw.already_occupied_count,
                propagated_delay_minutes=bw.propagated_delay_minutes,
                secondary_delay_minutes=bw.secondary_delay_minutes,
            )
            conflicts = [
                ConflictSchema(
                    train_number=c.train_number,
                    train_type=c.train_type,
                    from_station=c.from_station,
                    to_station=c.to_station,
                    train_entry=c.train_entry.isoformat(),
                    train_exit=c.train_exit.isoformat(),
                    overlap_minutes=c.overlap_minutes,
                    conflict_type=c.conflict_type.value,
                )
                for c in best_sim.conflicts
            ]
            alternatives = [
                AlternativeSchema(
                    start=s.window.start.isoformat(),
                    end=s.window.end.isoformat(),
                    conflict_count=s.window.conflict_count,
                    direct_delay_minutes=s.window.direct_delay_minutes,
                    impact_score=s.window.impact_score,
                    alternative_type="JOINT_FEASIBLE_ALTERNATIVE",
                )
                for s in all_sims[1:6]
            ]
            explanation = generate_explanation(
                best_window=bw,
                conflicts=best_sim.conflicts,
                all_windows=[s.window for s in all_sims],
                from_station=request.from_station,
                to_station=request.to_station,
                duration_minutes=request.duration_minutes,
            )

        # ── 6. Multi-request recommendations list ─────────────────────────
        recommendations_list: List[PlanItemRecommendation] = []
        for item in all_pending:
            sim = planner_result.per_request_results.get(item.request_id)
            alts = planner_result.per_request_alternatives.get(item.request_id, [])
            item_all_sims = [sim] + alts if sim else []

            if sim is not None:
                w = sim.window
                item_breakdown = (
                    [ScoreBreakdownItemSchema(**b) for b in w.score_breakdown]
                    if getattr(w, "score_breakdown", None)
                    else None
                )
                rec_schema = RecommendationSchema(
                    start=w.start.isoformat(),
                    end=w.end.isoformat(),
                    impact_score=w.impact_score,
                    score_breakdown=item_breakdown,
                )
                met_schema = MetricsSchema(
                    conflict_count=w.conflict_count,
                    affected_train_count=len(w.affected_trains),
                    direct_delay_minutes=w.direct_delay_minutes,
                    cascade_delay_minutes=w.cascade_delay_minutes,
                    total_delay_minutes=w.total_delay_minutes if w.total_delay_minutes > 0.0 or w.cascade_status == "PHASE_2_DETERMINISTIC" else w.direct_delay_minutes,
                    blocking_conflict_count=w.blocking_conflict_count,
                    entry_block_count=w.entry_block_count,
                    already_occupied_count=w.already_occupied_count,
                    propagated_delay_minutes=w.propagated_delay_minutes,
                    secondary_delay_minutes=w.secondary_delay_minutes,
                )
                confl_schemas = [
                    ConflictSchema(
                        train_number=c.train_number,
                        train_type=c.train_type,
                        from_station=c.from_station,
                        to_station=c.to_station,
                        train_entry=c.train_entry.isoformat(),
                        train_exit=c.train_exit.isoformat(),
                        overlap_minutes=c.overlap_minutes,
                        conflict_type=c.conflict_type.value,
                    )
                    for c in sim.conflicts
                ]
                alt_schemas = [
                    AlternativeSchema(
                        start=s.window.start.isoformat(),
                        end=s.window.end.isoformat(),
                        conflict_count=s.window.conflict_count,
                        direct_delay_minutes=s.window.direct_delay_minutes,
                        impact_score=s.window.impact_score,
                        alternative_type="JOINT_FEASIBLE_ALTERNATIVE",
                    )
                    for s in item_all_sims[1:6]
                ]
                item_expl = generate_explanation(
                    best_window=w,
                    conflicts=sim.conflicts,
                    all_windows=[s.window for s in item_all_sims],
                    from_station=item.from_station,
                    to_station=item.to_station,
                    duration_minutes=item.duration_minutes,
                )
                recommendations_list.append(
                    PlanItemRecommendation(
                        request_id=item.request_id,
                        from_station=item.from_station,
                        to_station=item.to_station,
                        status="RECOMMENDED",
                        recommendation=rec_schema,
                        metrics=met_schema,
                        conflicts=confl_schemas,
                        alternatives=alt_schemas,
                        explanation=item_expl,
                        delay_trace=[DelayTraceItem(**t) for t in w.delay_trace] if w.delay_trace else None,
                        score_breakdown=item_breakdown,
                    )
                )
            else:
                recommendations_list.append(
                    PlanItemRecommendation(
                        request_id=item.request_id,
                        from_station=item.from_station,
                        to_station=item.to_station,
                        status="NO_FEASIBLE_WINDOW",
                        recommendation=None,
                        metrics=self._empty_metrics(),
                        conflicts=[],
                        alternatives=[],
                        explanation=f"No feasible window could be allocated for {item.request_id}.",
                    )
                )

        # ── 7. Bundles and Metrics ────────────────────────────────────────
        bundles = [
            BundleCandidate(
                bundle_id=b.bundle_id,
                request_ids=b.request_ids,
                section=b.section,
                combined_start=b.combined_start.isoformat(),
                combined_end=b.combined_end.isoformat(),
                combined_duration_minutes=b.combined_duration_minutes,
                bundle_impact_score=b.bundle_impact_score,
                individual_impact_sum=b.individual_impact_sum,
                recommendation=b.recommendation,
                reason=b.reason,
            )
            for b in planner_result.bundle_candidates
        ]

        overall_metrics = OverallMetricsSchema(
            total_impact_score=planner_result.total_impact_score,
            total_direct_delay_minutes=planner_result.total_direct_delay_minutes,
            total_conflicts=planner_result.total_conflicts,
            total_affected_trains=planner_result.total_affected_trains,
        )

        scheduled_count = sum(
            1 for sim in planner_result.per_request_results.values() if sim is not None
        )
        planning_summary = PlanningSummarySchema(
            planning_mode=planning_state.planning_mode,
            total_pending=len(all_pending),
            total_fixed=len(fixed_plans),
            scheduled_count=scheduled_count,
            unfeasible_count=len(planner_result.infeasible_request_ids),
            algorithm_used=planner_result.algorithm_used,
        )

        metadata = MetadataSchema(
            request_id=request.request_id,
            brain_run_id=brain_run_id,
            trace_id=trace_id,
            dataset_version=DATASET_VERSION,
            algorithm_version=ALGORITHM_VERSION,
            cascade_simulation=bw.cascade_status if (best_sim and bw.cascade_status != "NOT_IMPLEMENTED") else NOT_IMPLEMENTED,
            cascade_reason=getattr(bw, "cascade_reason", None) if best_sim else None,
            candidate_windows_evaluated=len(all_sims),
            window_step_minutes=DEFAULT_WINDOW_STEP_MINUTES,
            plan_version=plan_version,
            total_requests_analyzed=len(all_pending),
            scoring_version=SCORING_VERSION,
        )

        plan_alternatives_schemas = [
            PlanAlternative(
                plan_alternative_id=pa["plan_alternative_id"],
                recommendations=[
                    PlanAlternativeItem(**rec) for rec in pa["recommendations"]
                ],
                overall_impact_score=pa["overall_impact_score"],
            )
            for pa in planner_result.plan_alternatives
        ] if planner_result.plan_alternatives else None

        return AnalyzeResponse(
            success=best_sim is not None,
            brain_run_id=brain_run_id,
            request_id=request.request_id,
            status=status,
            recommendation=recommendation,
            metrics=metrics,
            conflicts=conflicts,
            alternatives=alternatives,
            explanation=explanation,
            metadata=metadata,
            plan_version=plan_version,
            planning_summary=planning_summary,
            recommendations=recommendations_list,
            bundles=bundles,
            overall_metrics=overall_metrics,
            fixed_plans=fixed_plans,
            plan_alternatives=plan_alternatives_schemas,
            delay_trace=[DelayTraceItem(**t) for t in bw.delay_trace] if (best_sim and bw.delay_trace) else None,
            score_breakdown=score_breakdown if best_sim else None,
        )

    # ── private helpers ───────────────────────────────────────────────────────

    def _empty_metrics(self) -> MetricsSchema:
        return MetricsSchema(
            conflict_count=0,
            affected_train_count=0,
            direct_delay_minutes=0.0,
            cascade_delay_minutes=0.0,
            total_delay_minutes=0.0,
            blocking_conflict_count=0,
            entry_block_count=0,
            already_occupied_count=0,
            propagated_delay_minutes=0.0,
            secondary_delay_minutes=0.0,
        )

    def _base_metadata(
        self, request: AnalyzeRequest, brain_run_id: str, trace_id: str,
        n_windows: int = 0,
    ) -> MetadataSchema:
        return MetadataSchema(
            request_id=request.request_id,
            brain_run_id=brain_run_id,
            trace_id=trace_id,
            dataset_version=DATASET_VERSION,
            algorithm_version=ALGORITHM_VERSION,
            cascade_simulation=NOT_IMPLEMENTED,
            candidate_windows_evaluated=n_windows,
            window_step_minutes=DEFAULT_WINDOW_STEP_MINUTES,
        )

    def _no_section_response(
        self, request: AnalyzeRequest, brain_run_id: str, trace_id: str,
    ) -> AnalyzeResponse:
        return AnalyzeResponse(
            success=False,
            brain_run_id=brain_run_id,
            request_id=request.request_id,
            status="SECTION_NOT_FOUND",
            recommendation=None,
            metrics=self._empty_metrics(),
            conflicts=[],
            alternatives=[],
            explanation=(
                f"Section {request.from_station}→{request.to_station} was not found "
                f"in the dataset. Only sections present in the CSV can be analyzed. "
                f"Verify the station codes and direction."
            ),
            metadata=self._base_metadata(request, brain_run_id, trace_id),
        )

    def _no_window_response(
        self, request: AnalyzeRequest, brain_run_id: str, trace_id: str,
    ) -> AnalyzeResponse:
        return AnalyzeResponse(
            success=False,
            brain_run_id=brain_run_id,
            request_id=request.request_id,
            status="NO_FEASIBLE_WINDOW",
            recommendation=None,
            metrics=self._empty_metrics(),
            conflicts=[],
            alternatives=[],
            explanation=(
                f"No feasible {request.duration_minutes}-minute window could be "
                f"generated within the requested time range for section "
                f"{request.from_station}→{request.to_station}."
            ),
            metadata=self._base_metadata(request, brain_run_id, trace_id),
        )

