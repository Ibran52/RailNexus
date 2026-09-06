"""
direct_delay.py — RailNexus Brain / core
Calculates direct blocking delay for trains that enter the blocked section.

Phase 1 scope: direct waiting delay ONLY.
Cascade / downstream effects: NOT_IMPLEMENTED.

Formula:
  direct_delay = max(0, (maintenance_end - train_entry).total_seconds() / 60)

A train that has ALREADY exited before maintenance starts incurs 0 delay.
"""

from __future__ import annotations

from datetime import datetime
from typing import List

from core.candidate_windows import CandidateWindow
from core.conflict_engine import ConflictRecord, ConflictType


def calculate_direct_delay(
    window: CandidateWindow,
    conflict: ConflictRecord,
) -> float:
    """
    Direct waiting delay in minutes for a single conflicting train.

    - If conflict_type is ENTRY_BLOCKED (train arrives during the block):
      Train waits at section entry until window.end.
      delay = window.end - train_entry.
    - If conflict_type is TRAIN_ALREADY_INSIDE_SECTION:
      The window is INFEASIBLE (cannot safely enter a block with a train inside).
      Direct waiting delay is not calculated for infeasible candidates -> returns 0.0.
    - If train already exited before maintenance or arrives after: returns 0.0.

    Returns
    -------
    float  — delay in minutes, always >= 0.
    """
    if conflict.conflict_type == ConflictType.TRAIN_ALREADY_INSIDE_SECTION:
        return 0.0

    if conflict.conflict_type == ConflictType.ENTRY_BLOCKED:
        delay_secs = (window.end - conflict.train_entry).total_seconds()
        return max(0.0, delay_secs / 60.0)

    return 0.0


def calculate_total_direct_delay(
    window: CandidateWindow,
    conflicts: List[ConflictRecord],
) -> float:
    """Sum of direct delays across all conflicting trains."""
    return round(
        sum(calculate_direct_delay(window, c) for c in conflicts),
        2,
    )
