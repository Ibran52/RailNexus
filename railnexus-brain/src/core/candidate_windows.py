"""
candidate_windows.py — RailNexus Brain / core
Generates all feasible maintenance time windows inside [earliest_start, latest_end].

Rules:
  - No window extends beyond latest_end.
  - Step size is configurable (default from config.py).
  - If no window fits, returns empty list — never raises silently.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import List, Optional

from config import DEFAULT_WINDOW_STEP_MINUTES


@dataclass
class CandidateWindow:
    start: datetime
    end: datetime
    # Populated by the simulation phase
    conflict_count: int = 0
    affected_trains: List[int] = field(default_factory=list)
    direct_delay_minutes: float = 0.0
    cascade_delay_minutes: float = 0.0
    impact_score: float = 0.0
    feasible: bool = True
    blocking_conflict_count: int = 0
    entry_block_count: int = 0
    already_occupied_count: int = 0
    infeasibility_reasons: List[dict] = field(default_factory=list)
    # Phase 2 Cascade simulation fields
    propagated_delay_minutes: float = 0.0
    secondary_delay_minutes: float = 0.0
    total_delay_minutes: float = 0.0
    cascade_status: str = "NOT_IMPLEMENTED"
    cascade_notes: str = ""
    delay_trace: List[dict] = field(default_factory=list)
    cascade_reason: Optional[dict] = None
    # Phase 3 Multi-Factor Impact Scoring fields
    score_breakdown: List[dict] = field(default_factory=list)



def generate_candidate_windows(
    earliest_start: datetime,
    latest_end: datetime,
    duration_minutes: int,
    step_minutes: int = DEFAULT_WINDOW_STEP_MINUTES,
) -> List[CandidateWindow]:
    """
    Slide a window of *duration_minutes* across [earliest_start, latest_end]
    in steps of *step_minutes*.

    A window is included only when its end <= latest_end.

    Parameters
    ----------
    earliest_start : datetime
    latest_end     : datetime
    duration_minutes : int   — maintenance block duration (must be > 0)
    step_minutes   : int     — sliding step (must be > 0)

    Returns
    -------
    List[CandidateWindow]   — empty if no window fits.

    Raises
    ------
    ValueError if step_minutes <= 0 or duration_minutes <= 0.
    """
    if step_minutes <= 0:
        raise ValueError(f"step_minutes must be > 0, got {step_minutes}.")
    if duration_minutes <= 0:
        raise ValueError(f"duration_minutes must be > 0, got {duration_minutes}.")

    duration = timedelta(minutes=duration_minutes)
    step     = timedelta(minutes=step_minutes)
    windows: List[CandidateWindow] = []
    current  = earliest_start

    while True:
        window_end = current + duration
        if window_end > latest_end:
            break
        windows.append(CandidateWindow(start=current, end=window_end))
        current += step

    return windows
