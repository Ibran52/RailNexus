"""
impact_score.py — RailNexus Brain / core
Calculates multi-factor impact score for candidate maintenance windows.

Phase 3 Multi-Factor Scoring Architecture:
- Factor A: Attributable Total Delay (DATA_BACKED, source: PHASE_2_CASCADE_SIMULATION)
- Factor B: Affected Train Count (DATA_BACKED, source: SIMULATION)
- Factor C: Train Priority / Type Contribution (PROTOTYPE_ASSUMPTION, source: CONFIGURATION)
- Factor D: Maintenance Request Priority (PROTOTYPE_ASSUMPTION, source: CONFIGURATION)

RULES:
- Deterministic, configurable, modular.
- Default configuration MUST preserve Phase 2 behavior:
  impact_score == total_attributable_delay_minutes.
- All newly introduced optional factors default to disabled / zero weight.
- Never fabricate unavailable data.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Sequence

import config
from core.candidate_windows import CandidateWindow


@dataclass
class ScoreBreakdownItem:
    """Detailed accounting for an individual impact factor."""
    factor: str
    raw_value: float
    weight: float
    weighted_value: float
    status: str
    source: str
    details: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "factor": self.factor,
            "raw_value": round(self.raw_value, 2),
            "weight": round(self.weight, 2),
            "weighted_value": round(self.weighted_value, 2),
            "status": self.status,
            "source": self.source,
        }
        if self.details is not None:
            d["details"] = self.details
        return d


@dataclass
class ScoreResult:
    """Consolidated outcome of the Phase 3 impact scoring calculation."""
    total_score: float
    breakdown: List[ScoreBreakdownItem] = field(default_factory=list)

    def __float__(self) -> float:
        return float(self.total_score)

    def __int__(self) -> int:
        return int(self.total_score)

    def __format__(self, format_spec: str) -> str:
        return format(self.total_score, format_spec)

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, (int, float)):
            return self.total_score == float(other)
        if isinstance(other, ScoreResult):
            return self.total_score == other.total_score and self.breakdown == other.breakdown
        return False

    def __lt__(self, other: Any) -> bool:
        val = other.total_score if isinstance(other, ScoreResult) else float(other)
        return self.total_score < val

    def __le__(self, other: Any) -> bool:
        val = other.total_score if isinstance(other, ScoreResult) else float(other)
        return self.total_score <= val

    def __gt__(self, other: Any) -> bool:
        val = other.total_score if isinstance(other, ScoreResult) else float(other)
        return self.total_score > val

    def __ge__(self, other: Any) -> bool:
        val = other.total_score if isinstance(other, ScoreResult) else float(other)
        return self.total_score >= val

    def __add__(self, other: Any) -> float:
        val = other.total_score if isinstance(other, ScoreResult) else float(other)
        return self.total_score + val

    def __radd__(self, other: Any) -> float:
        val = other.total_score if isinstance(other, ScoreResult) else float(other)
        return val + self.total_score

    def __sub__(self, other: Any) -> float:
        val = other.total_score if isinstance(other, ScoreResult) else float(other)
        return self.total_score - val

    def __rsub__(self, other: Any) -> float:
        val = other.total_score if isinstance(other, ScoreResult) else float(other)
        return val - self.total_score

    def __repr__(self) -> str:
        return f"ScoreResult(total_score={self.total_score:.2f}, breakdown_items={len(self.breakdown)})"


def get_uniquely_affected_trains(window: CandidateWindow) -> List[int]:
    """
    Extract unique trains that incurred non-zero final attributable delay.
    Does NOT count repeated movements, delay trace records, or propagated events.
    """
    if getattr(window, "delay_trace", None):
        train_attr_delay: Dict[int, float] = {}
        for t in window.delay_trace:
            tn = t.get("train_number") if isinstance(t, dict) else getattr(t, "train_number", None)
            dtype = t.get("delay_type") if isinstance(t, dict) else getattr(t, "delay_type", None)
            mins = t.get("delay_minutes", 0.0) if isinstance(t, dict) else getattr(t, "delay_minutes", 0.0)
            if tn is not None and dtype in ("DIRECT", "SECONDARY"):
                train_attr_delay[tn] = train_attr_delay.get(tn, 0.0) + mins
        return sorted([tn for tn, d in train_attr_delay.items() if d > 0.0])
    
    # Fallback when delay_trace is not present
    if window.total_delay_minutes > 0.0 or window.direct_delay_minutes > 0.0:
        if getattr(window, "affected_trains", None):
            return sorted(list(set(window.affected_trains)))
    return []


def compute_impact_score(
    window: CandidateWindow,
    repo: Optional[Any] = None,
    request_priority: str = "MEDIUM",
    conflicts: Optional[Sequence[Any]] = None,
) -> ScoreResult:
    """
    Compute modular Phase 3 impact score and return a structured ScoreResult.

    Formula:
        impact_score = round(
            total_delay_component
            + affected_train_component
            + train_priority_component
            + maintenance_priority_component,
            2
        )
    """
    # ── Factor A: Attributable Total Delay ─────────────────────────────────────
    # Source of truth: Phase 2 final attributable delay calculation
    if window.total_delay_minutes > 0.0 or getattr(window, "cascade_status", "") == "PHASE_2_DETERMINISTIC":
        raw_delay = float(window.total_delay_minutes)
    else:
        raw_delay = float(window.direct_delay_minutes)

    delay_weight = float(getattr(config, "DELAY_WEIGHT", 1.0))
    weighted_delay = round(raw_delay * delay_weight, 2)
    source_delay = (
        "PHASE_2_CASCADE_SIMULATION"
        if getattr(window, "cascade_status", None) in ("PHASE_2_DETERMINISTIC", "PARTIAL")
        else "SIMULATION"
    )
    factor_a = ScoreBreakdownItem(
        factor="total_delay",
        raw_value=round(raw_delay, 2),
        weight=round(delay_weight, 2),
        weighted_value=weighted_delay,
        status="DATA_BACKED",
        source=source_delay,
        details="Attributable total delay (direct + secondary waiting delay)",
    )

    # ── Factor B: Affected Train Count ────────────────────────────────────────
    # Unique trains with non-zero final attributable delay
    uniquely_affected = get_uniquely_affected_trains(window)
    affected_count = float(len(uniquely_affected))
    enable_affected = bool(getattr(config, "ENABLE_AFFECTED_TRAIN_FACTOR", False))
    raw_affected_weight = float(getattr(config, "AFFECTED_TRAIN_WEIGHT", 0.0))
    effective_affected_weight = raw_affected_weight if enable_affected else 0.0
    weighted_affected = round(affected_count * effective_affected_weight, 2)
    status_affected = "DATA_BACKED" if enable_affected else "DATA_BACKED"

    factor_b = ScoreBreakdownItem(
        factor="affected_train_count",
        raw_value=affected_count,
        weight=round(effective_affected_weight, 2),
        weighted_value=weighted_affected,
        status=status_affected,
        source="SIMULATION",
        details=f"Unique delayed trains: {uniquely_affected}" if uniquely_affected else "No delayed trains",
    )

    # ── Factor C: Train Priority / Type Contribution ──────────────────────────
    enable_train_prio = bool(getattr(config, "ENABLE_TRAIN_PRIORITY_FACTOR", False))
    raw_train_prio_weight = float(getattr(config, "TRAIN_PRIORITY_WEIGHT", 0.0))
    effective_train_prio_weight = raw_train_prio_weight if enable_train_prio else 0.0
    type_weights = getattr(config, "TRAIN_TYPE_WEIGHTS", {})

    # Map train numbers to train_type
    train_types: Dict[int, str] = {}
    if conflicts:
        for c in conflicts:
            tn = getattr(c, "train_number", None)
            tt = getattr(c, "train_type", None)
            if tn is not None and tt is not None:
                train_types[tn] = str(tt).strip()

    if repo is not None:
        for tn in uniquely_affected:
            if tn not in train_types and hasattr(repo, "get_train_movements"):
                movs = repo.get_train_movements(tn)
                if movs:
                    tt = getattr(movs[0], "train_type", None)
                    if tt:
                        train_types[tn] = str(tt).strip()

    raw_train_prio = 0.0
    unmapped_types: List[int] = []
    for tn in uniquely_affected:
        tt = train_types.get(tn)
        if tt is not None and tt in type_weights:
            raw_train_prio += float(type_weights[tt])
        else:
            # Never fabricate missing train types or unmapped weights
            unmapped_types.append(tn)

    weighted_train_prio = round(raw_train_prio * effective_train_prio_weight, 2)
    if unmapped_types and enable_train_prio:
        status_train_prio = "MISSING DATA"
        details_train_prio = f"Unmapped train types for trains: {unmapped_types}; no weight fabricated."
    else:
        status_train_prio = "PROTOTYPE_ASSUMPTION"
        details_train_prio = "Configured train-type weighting (prototype assumption, not official railway policy)"

    factor_c = ScoreBreakdownItem(
        factor="train_priority",
        raw_value=round(raw_train_prio, 2),
        weight=round(effective_train_prio_weight, 2),
        weighted_value=weighted_train_prio,
        status=status_train_prio,
        source="CONFIGURATION",
        details=details_train_prio,
    )

    # ── Factor D: Maintenance Request Priority ────────────────────────────────
    enable_maint_prio = bool(getattr(config, "ENABLE_MAINTENANCE_PRIORITY_FACTOR", False))
    raw_maint_prio_weight = float(getattr(config, "MAINTENANCE_PRIORITY_WEIGHT", 0.0))
    effective_maint_prio_weight = raw_maint_prio_weight if enable_maint_prio else 0.0
    maint_weights = getattr(config, "MAINTENANCE_PRIORITY_WEIGHTS", {})

    prio_key = str(request_priority).strip().upper() if request_priority else "MEDIUM"
    raw_maint_prio = float(maint_weights.get(prio_key, 0.0))
    weighted_maint_prio = round(raw_maint_prio * effective_maint_prio_weight, 2)

    factor_d = ScoreBreakdownItem(
        factor="maintenance_priority",
        raw_value=round(raw_maint_prio, 2),
        weight=round(effective_maint_prio_weight, 2),
        weighted_value=weighted_maint_prio,
        status="PROTOTYPE_ASSUMPTION",
        source="CONFIGURATION",
        details=f"Maintenance priority '{prio_key}' weighting (prototype assumption)",
    )

    # ── Final Score Aggregation ───────────────────────────────────────────────
    breakdown = [factor_a, factor_b, factor_c, factor_d]
    total_score = round(
        weighted_delay + weighted_affected + weighted_train_prio + weighted_maint_prio,
        2,
    )

    return ScoreResult(total_score=total_score, breakdown=breakdown)
