"""
schemas.py — RailNexus Brain / api
Pydantic request and response models for the FastAPI layer.

These models form the public JSON contract between the Brain and the
Node.js/Express backend. Changing them is a breaking API change.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ── Status Enums & Planning State Models ───────────────────────────────────────

class RequestStatus(str, Enum):
    PENDING = "PENDING"
    RECOMMENDED = "RECOMMENDED"
    APPROVED = "APPROVED"
    SCHEDULED = "SCHEDULED"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class PendingRequestItem(BaseModel):
    """A maintenance request participating in the current planning state."""
    request_id: str = Field(..., description="Unique ID for this maintenance request.")
    from_station: str = Field(..., description="Departure station code.")
    to_station: str = Field(..., description="Arrival station code.")
    duration_minutes: int = Field(..., gt=0, description="Block duration in minutes.")
    earliest_start: datetime = Field(..., description="Earliest window start (ISO 8601).")
    latest_end: datetime = Field(..., description="Latest window end (ISO 8601).")
    priority: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = Field(
        default="MEDIUM", description="Operational priority."
    )
    status: Optional[RequestStatus] = Field(
        default=RequestStatus.PENDING, description="Lifecycle status of this request."
    )

    @field_validator("earliest_start", "latest_end", mode="after")
    @classmethod
    def strip_timezone(cls, v: datetime) -> datetime:
        if v.tzinfo is not None:
            return v.astimezone(timezone.utc).replace(tzinfo=None)
        return v

    @field_validator("from_station", "to_station", mode="before")
    @classmethod
    def strip_station(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Station code must not be blank.")
        return v


class FixedPlanItem(BaseModel):
    """
    An already approved or scheduled maintenance plan.
    Treated as an immoveable exclusion constraint on its section.
    """
    request_id: str = Field(..., description="Unique ID of the approved/scheduled request.")
    from_station: str = Field(..., description="Departure station code.")
    to_station: str = Field(..., description="Arrival station code.")
    allocated_start: datetime = Field(..., description="Allocated window start time.")
    allocated_end: datetime = Field(..., description="Allocated window end time.")
    status: RequestStatus = Field(
        default=RequestStatus.APPROVED, description="Status confirming this window is locked."
    )

    @field_validator("status", mode="after")
    @classmethod
    def validate_locked_status(cls, v: RequestStatus) -> RequestStatus:
        if v not in (RequestStatus.APPROVED, RequestStatus.SCHEDULED):
            raise ValueError(f"FixedPlanItem status must be APPROVED or SCHEDULED, got {v.value}.")
        return v

    @field_validator("allocated_start", "allocated_end", mode="after")
    @classmethod
    def strip_timezone(cls, v: datetime) -> datetime:
        if v.tzinfo is not None:
            return v.astimezone(timezone.utc).replace(tzinfo=None)
        return v


    @field_validator("from_station", "to_station", mode="before")
    @classmethod
    def strip_station(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Station code must not be blank.")
        return v


class PlanningState(BaseModel):
    """
    Container for the global planning context sent by the Node.js backend.
    """
    version: Optional[int] = Field(
        default=None,
        description="Backend-managed planning state version number.",
        examples=[1],
    )
    planning_mode: Literal["INITIAL", "REPLAN"] = Field(
        default="INITIAL",
        description="Backend-managed planning mode: INITIAL for new batches, REPLAN on updates.",
    )
    pending_requests: List[PendingRequestItem] = Field(
        default_factory=list,
        description="Active pending requests to be planned jointly.",
    )
    fixed_plans: List[FixedPlanItem] = Field(
        default_factory=list,
        description="Approved/scheduled maintenance plans acting as fixed exclusions.",
    )


# ── Request ───────────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    """
    Runtime maintenance request sent by the Node.js backend.
    This data does NOT come from the CSV — it arrives at runtime via the API.
    """

    request_id: str = Field(
        ...,
        description="Unique ID for this maintenance request (assigned by the backend).",
        examples=["REQ-001"],
    )
    from_station: str = Field(
        ...,
        description="Departure station code of the section to be maintained.",
        examples=["KE"],
    )
    to_station: str = Field(
        ...,
        description="Arrival station code of the section to be maintained.",
        examples=["ATG"],
    )
    duration_minutes: int = Field(
        ...,
        gt=0,
        description="Required maintenance block duration in minutes.",
        examples=[120],
    )
    earliest_start: datetime = Field(
        ...,
        description="Earliest time the maintenance window may begin (ISO 8601).",
        examples=["1900-01-01T10:00:00"],
    )
    latest_end: datetime = Field(
        ...,
        description="Latest time the maintenance window must finish (ISO 8601).",
        examples=["1900-01-01T20:00:00"],
    )
    priority: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = Field(
        default="MEDIUM",
        description="Operational priority (informational only in Phase 1).",
    )
    planning_state: Optional[PlanningState] = Field(
        default=None,
        description="Optional dynamic planning state container sent by the backend.",
    )

    @field_validator("earliest_start", "latest_end", mode="after")
    @classmethod
    def strip_timezone(cls, v: datetime) -> datetime:
        if v.tzinfo is not None:
            return v.astimezone(timezone.utc).replace(tzinfo=None)
        return v

    @field_validator("from_station", "to_station", mode="before")
    @classmethod
    def strip_station_code(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Station code must not be blank.")
        return v

    @model_validator(mode="after")
    def validate_window(self) -> "AnalyzeRequest":
        if self.from_station == self.to_station:
            raise ValueError(
                f"from_station and to_station must differ; both are '{self.from_station}'."
            )
        if self.earliest_start >= self.latest_end:
            raise ValueError(
                f"earliest_start ({self.earliest_start}) must be before "
                f"latest_end ({self.latest_end})."
            )
        window_mins = (self.latest_end - self.earliest_start).total_seconds() / 60
        if window_mins < self.duration_minutes:
            raise ValueError(
                f"The available time range ({window_mins:.0f} min) is narrower than "
                f"duration_minutes ({self.duration_minutes}). "
                "No feasible window can be generated."
            )
        return self


# ── Sub-objects in the response ───────────────────────────────────────────────

class ScoreBreakdownItemSchema(BaseModel):
    factor: str
    raw_value: float
    weight: float
    weighted_value: float
    status: str
    source: str
    details: Optional[str] = None


class RecommendationSchema(BaseModel):
    start: str
    end: str
    impact_score: float
    score_breakdown: Optional[List[ScoreBreakdownItemSchema]] = None


class DelayTraceItem(BaseModel):
    train_number: int
    movement_index: int
    delay_type: str
    delay_minutes: float
    from_station: str
    to_station: str
    original_start: str
    original_end: str
    shifted_start: str
    shifted_end: str
    source_train_number: Optional[int] = None
    source_movement_index: Optional[int] = None
    reason: Optional[str] = ""


class MetricsSchema(BaseModel):
    conflict_count: int
    affected_train_count: int
    direct_delay_minutes: float
    cascade_delay_minutes: float
    total_delay_minutes: float
    blocking_conflict_count: Optional[int] = None
    entry_block_count: Optional[int] = None
    already_occupied_count: Optional[int] = None
    propagated_delay_minutes: Optional[float] = Field(
        default=None,
        description=(
            "Propagation impact / downstream shifted minutes (non-additive trace metric). "
            "Sum of downstream movement schedule shift increments. Total delay = direct + secondary."
        ),
    )
    secondary_delay_minutes: Optional[float] = Field(
        default=None,
        description="Waiting delay incurred by other trains in secondary same-section conflicts.",
    )


class ConflictSchema(BaseModel):
    train_number: int
    train_type: str
    from_station: str
    to_station: str
    train_entry: str
    train_exit: str
    overlap_minutes: float
    conflict_type: Optional[str] = None


class AlternativeSchema(BaseModel):
    start: str
    end: str
    conflict_count: int
    direct_delay_minutes: float
    impact_score: float
    alternative_type: Optional[str] = Field(
        default="SINGLE_REQUEST_ALTERNATIVE",
        description="Type of alternative window: SINGLE_REQUEST_ALTERNATIVE or JOINT_FEASIBLE_ALTERNATIVE.",
    )


class PlanAlternativeItem(BaseModel):
    request_id: str
    start: str
    end: str


class PlanAlternative(BaseModel):
    """Complete alternative plan combination across all scheduled requests."""
    plan_alternative_id: str
    recommendations: List[PlanAlternativeItem]
    overall_impact_score: float


class MetadataSchema(BaseModel):
    request_id: str
    brain_run_id: str
    trace_id: str
    dataset_version: str
    algorithm_version: str
    cascade_simulation: str
    cascade_reason: Optional[Dict[str, str]] = None
    candidate_windows_evaluated: int
    window_step_minutes: int
    plan_version: Optional[int] = None
    total_requests_analyzed: Optional[int] = None
    scoring_version: Optional[str] = "PHASE_3_V1"
    propagation_metric_clarification: Optional[str] = Field(
        default="propagated_delay_minutes is a non-additive downstream propagation trace metric (sum of downstream schedule shifts across movements). Network total delay = direct_delay_minutes + secondary_delay_minutes.",
        description="Clarification on delay metric additive accounting.",
    )


class PlanItemRecommendation(BaseModel):
    """Recommendation result for an individual maintenance request in multi-planning mode."""
    request_id: str
    from_station: str
    to_station: str
    status: str
    recommendation: Optional[RecommendationSchema] = None
    metrics: Optional[MetricsSchema] = None
    conflicts: Optional[List[ConflictSchema]] = None
    alternatives: Optional[List[AlternativeSchema]] = None
    explanation: Optional[str] = None
    delay_trace: Optional[List[DelayTraceItem]] = None
    score_breakdown: Optional[List[ScoreBreakdownItemSchema]] = None


class BundleCandidate(BaseModel):
    """Identified bundle opportunity across compatible maintenance requests on the same section."""
    bundle_id: str
    request_ids: List[str]
    section: str
    combined_start: str
    combined_end: str
    combined_duration_minutes: int
    bundle_impact_score: float
    individual_impact_sum: float
    recommendation: Literal["BUNDLE", "SEPARATE"]
    reason: Optional[str] = None


class PlanningSummarySchema(BaseModel):
    """Summary of the joint planning run."""
    planning_mode: str
    total_pending: int
    total_fixed: int
    scheduled_count: int
    unfeasible_count: int
    algorithm_used: str


class OverallMetricsSchema(BaseModel):
    """Aggregated impact metrics across all requests in the plan."""
    total_impact_score: float
    total_direct_delay_minutes: float
    total_conflicts: int
    total_affected_trains: int


# ── Success response ──────────────────────────────────────────────────────────

class AnalyzeResponse(BaseModel):
    success: bool
    brain_run_id: str
    request_id: str
    status: str

    recommendation: Optional[RecommendationSchema]
    metrics: MetricsSchema
    conflicts: List[ConflictSchema]
    alternatives: List[AlternativeSchema]
    explanation: str
    metadata: MetadataSchema

    # Planning state extensions (optional, populated when planning_state is provided)
    plan_version: Optional[int] = None
    planning_summary: Optional[PlanningSummarySchema] = None
    recommendations: Optional[List[PlanItemRecommendation]] = None
    bundles: Optional[List[BundleCandidate]] = None
    overall_metrics: Optional[OverallMetricsSchema] = None
    fixed_plans: Optional[List[FixedPlanItem]] = None
    infeasibility_reasons: Optional[List[Dict[str, Any]]] = None
    plan_alternatives: Optional[List[PlanAlternative]] = None
    delay_trace: Optional[List[DelayTraceItem]] = None
    score_breakdown: Optional[List[ScoreBreakdownItemSchema]] = None


# ── Error response ────────────────────────────────────────────────────────────

class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    success: bool = False
    error: ErrorDetail


# ── Health / data-status ──────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


class DataStatusResponse(BaseModel):
    status: str
    dataset: str
    row_count: int
    train_count: int
    station_count: int
    validation_errors: int
    validation_warnings: int
