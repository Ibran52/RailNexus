"""
conflict_engine.py — RailNexus Brain / core
Detects conflicts between a maintenance window and train movements in the dataset.

Conflict requires BOTH:
  1. Exact section match (from_station AND to_station)
  2. Time interval overlap:
       train.from_dt < maintenance_end
       AND
       train.to_dt   > maintenance_start

No geographic inference. No fabricated data.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import List

from core.candidate_windows import CandidateWindow
from core.train_repository import TrainMovement


class ConflictType(str, Enum):
    NO_CONFLICT = "NO_CONFLICT"
    ENTRY_BLOCKED = "ENTRY_BLOCKED"
    TRAIN_ALREADY_INSIDE_SECTION = "TRAIN_ALREADY_INSIDE_SECTION"


@dataclass
class ConflictRecord:
    train_number: int
    train_type: str
    from_station: str
    to_station: str
    train_entry: datetime
    train_exit: datetime
    overlap_minutes: float
    conflict_type: ConflictType = ConflictType.ENTRY_BLOCKED


def find_conflicts(
    window: CandidateWindow,
    trains: List[TrainMovement],
) -> List[ConflictRecord]:
    """
    Return all ConflictRecords for trains that clash with *window*.

    *trains* must already be pre-filtered to the correct section by the
    repository layer. This function applies the time-overlap check and
    classifies each conflict into ENTRY_BLOCKED or TRAIN_ALREADY_INSIDE_SECTION.

    Parameters
    ----------
    window : CandidateWindow
    trains : List[TrainMovement]  — movements on the maintenance section

    Returns
    -------
    List[ConflictRecord]
    """
    records: List[ConflictRecord] = []

    for t in trains:
        # Interval overlap predicate: train must be present during [window.start, window.end]
        if t.from_dt < window.end and t.to_dt > window.start:
            overlap_start = max(window.start, t.from_dt)
            overlap_end = min(window.end, t.to_dt)
            overlap_mins = (overlap_end - overlap_start).total_seconds() / 60.0

            if t.from_dt < window.start and t.to_dt > window.start:
                c_type = ConflictType.TRAIN_ALREADY_INSIDE_SECTION
            else:
                c_type = ConflictType.ENTRY_BLOCKED

            records.append(ConflictRecord(
                train_number=t.train_number,
                train_type=t.train_type,
                from_station=t.from_station,
                to_station=t.to_station,
                train_entry=t.from_dt,
                train_exit=t.to_dt,
                overlap_minutes=round(overlap_mins, 2),
                conflict_type=c_type,
            ))

    return records

