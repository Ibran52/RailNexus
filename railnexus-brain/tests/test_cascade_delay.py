"""
test_cascade_delay.py — RailNexus Brain / tests
Comprehensive test suite for Phase 2: Cascade Delay Simulation Engine.

Verifies:
1. Sequence building & continuity checks (continuous, broken, no synthetic connections).
2. Same-train downstream propagation (duration & gap preservation, broken sequence halt).
3. Secondary conflict interaction & effective timing (same section, no overlap, different section, attribution).
4. Queue termination & depth bounds (finite termination, MAX_CASCADE_DEPTH, no cycles).
5. Non-double-counting metric identities.
6. API response models (metrics, delay_trace, versioning, legacy compatibility).
7. Joint planning & bundling with Phase 2 metrics.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import List

import pandas as pd
import pytest

_SRC = str(Path(__file__).parent.parent / "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

from config import CASCADE_SIMULATION_VERSION, MAX_CASCADE_DEPTH  # type: ignore
from core.candidate_windows import CandidateWindow  # type: ignore
from core.cascade_delay import (  # type: ignore
    CascadeResult,
    DelayEvent,
    DelayTraceRecord,
    DelayType,
    _has_precedence,
    simulate_cascade_delay,
)
from core.conflict_engine import ConflictRecord, ConflictType, find_conflicts  # type: ignore
from core.data_loader import get_cached_dataframe  # type: ignore
from core.direct_delay import calculate_direct_delay  # type: ignore
from core.explanation import generate_explanation  # type: ignore
from core.impact_score import compute_impact_score  # type: ignore
from core.joint_planner import joint_plan  # type: ignore
from core.optimizer import run_optimization, simulate_window  # type: ignore
from core.train_repository import TrainMovement, TrainRepository  # type: ignore
from core.train_sequence import (  # type: ignore
    MovementId,
    MovementRecord,
    TrainMovementSequence,
    TrainSequenceRepository,
)



def _dt(h: int, m: int = 0) -> datetime:
    return datetime(1900, 1, 1, h, m, 0)


def _make_df(rows: List[dict]) -> pd.DataFrame:
    records = []
    for r in rows:
        f_dt = r["from_dt"]
        t_dt = r["to_dt"]
        dur = r.get(
            "occupancy_duration_mins",
            max(0.0, (t_dt - f_dt).total_seconds() / 60.0),
        )
        records.append({
            "train_number": r["train_number"],
            "train_type": r.get("train_type", "EXP"),
            "from_station": r["from_station"],
            "to_station": r["to_station"],
            "from_time": f_dt.strftime("%H:%M:%S"),
            "to_time": t_dt.strftime("%H:%M:%S"),
            "day": 1.0,
            "block_section_km": 10.0,
            "from_dt": f_dt,
            "to_dt": t_dt,
            "occupancy_duration_mins": dur,
        })
    return pd.DataFrame(records)


# ── 1. Sequence building & continuity checks ─────────────────────────────────

def test_01_train_movements_sorted_chronologically():
    df = _make_df([
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(11), "to_dt": _dt(12)},
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(9), "to_dt": _dt(10)},
    ])
    repo = TrainSequenceRepository(df)
    seq = repo.get_sequence(101)
    assert seq is not None
    assert len(seq) == 2
    assert seq.movements[0].from_station == "A"
    assert seq.movements[1].from_station == "B"


def test_02_continuous_movement_sequence_detected():
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(9), "to_dt": _dt(10)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 15), "to_dt": _dt(11)},
    ])
    repo = TrainSequenceRepository(df)
    seq = repo.get_sequence(101)
    assert seq.is_continuous_transition(0, 1) is True


def test_03_broken_sequence_detected():
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(9), "to_dt": _dt(10)},
        {"train_number": 101, "from_station": "X", "to_station": "Y", "from_dt": _dt(11), "to_dt": _dt(12)},
    ])
    repo = TrainSequenceRepository(df)
    seq = repo.get_sequence(101)
    assert seq.is_continuous_transition(0, 1) is False


def test_04_no_synthetic_connections_created():
    # Verify real CSV missing segment between KJT and LNL for train 11007
    real_df = get_cached_dataframe()
    repo = TrainSequenceRepository(real_df)
    seq = repo.get_sequence(11007)
    assert seq is not None
    # Find any boundary with broken connection
    has_gap = False
    for i in range(len(seq) - 1):
        if not seq.is_continuous_transition(i, i + 1):
            has_gap = True
            break
    assert has_gap is True, "Expected realistic track sequence gap in actual dataset."


# ── 2. Same-train downstream propagation ─────────────────────────────────────

def test_05_direct_delay_propagates_to_next_movement():
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 45), "to_dt": _dt(11, 15)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    # Direct delay = 10:20 - 10:00 = 20 mins
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    assert res.direct_delay_minutes == 20.0
    assert res.propagated_delay_minutes == 20.0
    assert len(res.trace) == 2
    assert res.trace[0].delay_type == "DIRECT"
    assert res.trace[1].delay_type == "PROPAGATED"
    assert res.trace[1].movement_index == 1
    assert res.trace[1].delay_minutes == 20.0


def test_06_direct_delay_propagates_across_multiple_movements():
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        {"train_number": 101, "from_station": "C", "to_station": "D", "from_dt": _dt(11, 0), "to_dt": _dt(11, 30)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 15))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=15.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    assert res.direct_delay_minutes == 15.0
    assert len(res.trace) == 3  # 1 DIRECT + 2 PROPAGATED
    prop_traces = [t for t in res.trace if t.delay_type == "PROPAGATED"]
    assert len(prop_traces) == 2
    for pt in prop_traces:
        assert pt.delay_minutes == 15.0


def test_07_movement_durations_preserved():
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 45)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(11), "to_dt": _dt(11, 40)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9), end=_dt(10, 15))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 45),
            overlap_minutes=15.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    for t in res.trace:
        orig_s = datetime.strptime(t.original_start, "%Y-%m-%d %H:%M")
        orig_e = datetime.strptime(t.original_end, "%Y-%m-%d %H:%M")
        shift_s = datetime.strptime(t.shifted_start, "%Y-%m-%d %H:%M")
        shift_e = datetime.strptime(t.shifted_end, "%Y-%m-%d %H:%M")
        assert (orig_e - orig_s) == (shift_e - shift_s)


def test_08_observed_gaps_preserved():
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        # 15 minute dwell/gap between 10:30 and 10:45
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 45), "to_dt": _dt(11, 15)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    t0 = res.trace[0]  # direct
    t1 = res.trace[1]  # propagated
    t0_shifted_end = datetime.strptime(t0.shifted_end, "%Y-%m-%d %H:%M")
    t1_shifted_start = datetime.strptime(t1.shifted_start, "%Y-%m-%d %H:%M")
    gap = (t1_shifted_start - t0_shifted_end).total_seconds() / 60.0
    assert gap == 15.0


def test_09_propagation_stops_at_broken_sequence():
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        # Broken boundary: B to X, next is Y to Z
        {"train_number": 101, "from_station": "Y", "to_station": "Z", "from_dt": _dt(11), "to_dt": _dt(11, 30)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    assert len(res.trace) == 1
    assert res.trace[0].delay_type == "DIRECT"
    assert res.propagated_delay_minutes == 0.0


# ── 3. Secondary conflict interaction & effective timing ─────────────────────

def test_10_secondary_same_section_overlap_detected():
    df = _make_df([
        # Train 101 delayed on A->B, then moves B->C
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        # Train 202 scheduled on B->C from 10:45 to 11:15
        {"train_number": 202, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 45), "to_dt": _dt(11, 15)},
    ])
    seq_repo = TrainSequenceRepository(df)
    # Block A->B until 10:20 (delaying 101 by 20m)
    # 101 on B->C shifts to 10:50..11:20
    # 202 arrives at 10:45, but section occupied by 101 from 10:50 to 11:20
    # Overlap occurs! 202 effective arrival (10:45) is before 101 arrives (10:50) wait,
    # if 202 arrives at 10:55, 101 clears at 11:20 -> 202 delayed!
    # Let's adjust 202 from_dt to 10:55 so 202 arrives after 101's effective start
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        {"train_number": 202, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 55), "to_dt": _dt(11, 25)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    # 101 B->C shifted to 10:50..11:20
    # 202 arrives 10:55. Contested! 202 delayed until 11:20 -> delay = 25m
    assert res.secondary_delay_minutes == 25.0
    sec_traces = [t for t in res.trace if t.delay_type == "SECONDARY"]
    assert len(sec_traces) == 1
    assert sec_traces[0].train_number == 202
    assert sec_traces[0].delay_minutes == 25.0


def test_11_no_overlap_zero_secondary_delay():
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        # Train 202 on B->C hours later
        {"train_number": 202, "from_station": "B", "to_station": "C", "from_dt": _dt(14), "to_dt": _dt(14, 30)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    assert res.secondary_delay_minutes == 0.0


def test_12_different_section_no_secondary_conflict():
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        # Train 303 operating at the same time but on X->Y
        {"train_number": 303, "from_station": "X", "to_station": "Y", "from_dt": _dt(10, 50), "to_dt": _dt(11, 20)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    assert res.secondary_delay_minutes == 0.0


def test_13_secondary_delay_attribution_trace():
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        {"train_number": 202, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 50), "to_dt": _dt(11, 20)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    sec_traces = [t for t in res.trace if t.delay_type == "SECONDARY"]
    assert len(sec_traces) >= 1
    t = sec_traces[0]
    assert t.source_train_number == 101
    assert t.source_movement_index is not None
    assert t.reason == "PROTOTYPE_ASSUMPTION_PRECEDENCE"


# ── 4. Queue termination & depth bounds ──────────────────────────────────────

def test_14_cascade_propagation_terminates():
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        {"train_number": 202, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 50), "to_dt": _dt(11, 20)},
        {"train_number": 202, "from_station": "C", "to_station": "D", "from_dt": _dt(11, 20), "to_dt": _dt(11, 50)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    assert res.status == CASCADE_SIMULATION_VERSION


def test_15_max_cascade_depth_respected():
    # Artificially small max_depth
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        {"train_number": 202, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 50), "to_dt": _dt(11, 20)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo, max_depth=1)
    # When max_depth=1, queue pops once and depth reaches limit
    assert res.status == "PARTIAL"


def test_16_no_duplicate_propagation_loop():
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    # Each movement has exactly 1 trace record
    mov_keys = [(t.train_number, t.movement_index) for t in res.trace]
    assert len(mov_keys) == len(set(mov_keys))


# ── 5. Non-double-counting metric identities ─────────────────────────────────

def test_17_delay_sum_identity_direct_prop_sec_equals_total():
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        {"train_number": 202, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 50), "to_dt": _dt(11, 20)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    # Non-double-counting identity: total = direct + secondary
    assert res.total_delay_minutes == round(res.direct_delay_minutes + res.secondary_delay_minutes, 2)


def test_18_cascade_delay_equals_secondary_delay():
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        {"train_number": 202, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 50), "to_dt": _dt(11, 20)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    # cascade_delay_minutes reports net secondary delay
    assert res.cascade_delay_minutes == res.secondary_delay_minutes


def test_19_no_double_counting_direct_delay():
    # Train A has direct=20, propagated downstream=20. Total delay must be 20, NOT 40!
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    assert res.direct_delay_minutes == 20.0
    assert res.propagated_delay_minutes == 20.0
    assert res.secondary_delay_minutes == 0.0
    assert res.total_delay_minutes == 20.0  # NOT 40!


# ── 6. API response models ───────────────────────────────────────────────────

def test_20_response_includes_cascade_metrics(test_client):
    body = {
        "request_id": "REQ-CASCADE-1",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T20:00:00",
        "priority": "HIGH",
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    metrics = data["metrics"]
    assert "direct_delay_minutes" in metrics
    assert "propagated_delay_minutes" in metrics
    assert "secondary_delay_minutes" in metrics
    assert "cascade_delay_minutes" in metrics
    assert "total_delay_minutes" in metrics


def test_21_response_includes_delay_trace(test_client):
    body = {
        "request_id": "REQ-CASCADE-2",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T20:00:00",
        "priority": "HIGH",
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert "delay_trace" in data


def test_22_successful_response_reports_phase_2_deterministic(test_client):
    body = {
        "request_id": "REQ-CASCADE-3",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T06:00:00",
        "latest_end": "1900-01-01T08:00:00",
        "priority": "HIGH",
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["metadata"]["cascade_simulation"] in ("PHASE_2_DETERMINISTIC", "PARTIAL")


def test_23_partial_propagation_reports_partial():
    # Verify that if max_depth is reached, CascadeResult.status is PARTIAL
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo, max_depth=0)
    assert res.status == "PARTIAL"


def test_24_legacy_response_structure_compatible(test_client):
    body = {
        "request_id": "REQ-LEGACY",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T20:00:00",
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    for k in ("success", "brain_run_id", "request_id", "status", "recommendation", "metrics", "conflicts", "alternatives", "explanation", "metadata"):
        assert k in data


# ── 7. Joint planning & bundling with Phase 2 metrics ────────────────────────

def test_25_joint_planner_uses_total_delay():
    # Verify joint_plan uses impact_score (total_delay_minutes)
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
    ])
    repo = TrainRepository(df)
    class Req:
        def __init__(self, rid):
            self.request_id = rid
            self.from_station = "A"
            self.to_station = "B"
            self.duration_minutes = 60
            self.earliest_start = _dt(8)
            self.latest_end = _dt(12)
            self.priority = "HIGH"
    res = joint_plan([Req("R1")], [], repo, step_minutes=60)
    assert res.algorithm_used in ("SINGLE", "JOINT_OPTIMAL")
    assert res.total_impact_score >= 0.0


def test_26_joint_planner_same_section_mutual_exclusion(test_client):
    body = {
        "request_id": "REQ-S1",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T15:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-S2",
                    "from_station": "KE",
                    "to_station": "ATG",
                    "duration_minutes": 60,
                    "earliest_start": "1900-01-01T11:00:00",
                    "latest_end": "1900-01-01T15:00:00",
                }
            ],
            "fixed_plans": [],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    recs = {rec["request_id"]: rec["recommendation"] for rec in data["recommendations"] if rec.get("recommendation")}
    if "REQ-S1" in recs and "REQ-S2" in recs:
        r1 = recs["REQ-S1"]
        r2 = recs["REQ-S2"]
        # Non-overlap check
        assert max(r1["start"], r2["start"]) >= min(r1["end"], r2["end"])


def test_27_joint_planner_different_sections_independent(test_client):
    body = {
        "request_id": "REQ-D1",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T15:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-D2",
                    "from_station": "TNA",
                    "to_station": "KLVA",
                    "duration_minutes": 60,
                    "earliest_start": "1900-01-01T11:00:00",
                    "latest_end": "1900-01-01T15:00:00",
                }
            ],
            "fixed_plans": [],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True


def test_28_fixed_plans_remain_protected(test_client):
    body = {
        "request_id": "REQ-FP-TEST",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T14:00:00",
        "planning_state": {
            "pending_requests": [],
            "fixed_plans": [
                {
                    "request_id": "FIXED-LOCKED",
                    "from_station": "KE",
                    "to_station": "ATG",
                    "allocated_start": "1900-01-01T10:00:00",
                    "allocated_end": "1900-01-01T12:00:00",
                    "status": "APPROVED",
                }
            ],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    rec = data["recommendation"]
    assert rec is not None
    # Must not overlap with fixed plan [10:00, 12:00]
    assert max(rec["start"], "1900-01-01T10:00:00") >= min(rec["end"], "1900-01-01T12:00:00")


def test_29_bundling_uses_total_delay_metrics(test_client):
    body = {
        "request_id": "REQ-BND-1",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T15:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-BND-2",
                    "from_station": "KE",
                    "to_station": "ATG",
                    "duration_minutes": 60,
                    "earliest_start": "1900-01-01T11:00:00",
                    "latest_end": "1900-01-01T15:00:00",
                }
            ],
            "fixed_plans": [],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    if data.get("bundles"):
        for b in data["bundles"]:
            assert "bundle_impact_score" in b
            assert "individual_impact_sum" in b


def test_30_bundling_labeled_phase_2_bundle_estimate(test_client):
    body = {
        "request_id": "REQ-BND-LABEL1",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T15:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-BND-LABEL2",
                    "from_station": "KE",
                    "to_station": "ATG",
                    "duration_minutes": 60,
                    "earliest_start": "1900-01-01T11:00:00",
                    "latest_end": "1900-01-01T15:00:00",
                }
            ],
            "fixed_plans": [],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    if data.get("bundles"):
        for b in data["bundles"]:
            assert "[PHASE 2 BUNDLE ESTIMATE]" in b["reason"]
            assert "[PHASE 1 BUNDLE ESTIMATE]" not in b["reason"]


# ── 8. Hardened Precedence, Secondary Propagation & Manual Cascade ─────────

def test_31_precedence_case_a_earlier_effective_start_wins():
    """Case A: Train A effective start < Train B effective start -> Train B delayed."""
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        {"train_number": 202, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 55), "to_dt": _dt(11, 25)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    sec_traces = [t for t in res.trace if t.delay_type == "SECONDARY"]
    assert len(sec_traces) == 1
    assert sec_traces[0].train_number == 202
    assert sec_traces[0].delay_minutes == 25.0
    assert sec_traces[0].reason == "PROTOTYPE_ASSUMPTION_PRECEDENCE"


def test_32_precedence_case_b_earlier_effective_start_wins():
    """Case B: Train B effective start < Train A effective start -> Train A delayed."""
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        {"train_number": 202, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 40), "to_dt": _dt(11, 10)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    sec_traces = [t for t in res.trace if t.delay_type == "SECONDARY"]
    assert len(sec_traces) == 1
    assert sec_traces[0].train_number == 101
    assert sec_traces[0].delay_minutes == 20.0
    assert sec_traces[0].source_train_number == 202
    assert sec_traces[0].reason == "PROTOTYPE_ASSUMPTION_PRECEDENCE"


def test_33_precedence_tie_breaker_earlier_original_start():
    """Equal effective arrival: earlier original start wins."""
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        {"train_number": 202, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 50), "to_dt": _dt(11, 20)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    sec_traces = [t for t in res.trace if t.delay_type == "SECONDARY"]
    assert len(sec_traces) == 1
    assert sec_traces[0].train_number == 202
    assert sec_traces[0].source_train_number == 101
    assert sec_traces[0].delay_minutes == 30.0


def test_34_precedence_tie_breaker_lower_train_number():
    """Equal effective start AND equal original start: lower train number wins."""
    df = _make_df([
        {"train_number": 202, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 50), "to_dt": _dt(11, 20)},
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10, 20), "to_dt": _dt(10, 50)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 50), "to_dt": _dt(11, 20)},
    ])
    seq_repo = TrainSequenceRepository(df)
    mov101 = seq_repo.get_sequence(101).get_movement(1)
    mov202 = seq_repo.get_sequence(202).get_movement(0)
    assert _has_precedence(mov101, _dt(10, 50), mov202, _dt(10, 50)) is True
    assert _has_precedence(mov202, _dt(10, 50), mov101, _dt(10, 50)) is False


def test_35_manual_scenario_multi_tier_cascade():
    """
    Deterministic manual scenario:
      Maintenance -> Train A direct +20 -> A Mov 2 shifted +20
      -> A Mov 2 overlaps Train B Mov 1 -> B gets +10 secondary
      -> B Mov 2 shifts +10 -> B Mov 2 overlaps Train C Mov 1
      -> C gets additional secondary delay
    """
    df = _make_df([
        # Train A (101): M1 on A->B (10:00-10:30), M2 on B->C (10:30-11:00)
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        # Train B (202): M1 on B->C (11:10-11:40), M2 on C->D (11:40-12:10)
        {"train_number": 202, "from_station": "B", "to_station": "C", "from_dt": _dt(11, 10), "to_dt": _dt(11, 40)},
        {"train_number": 202, "from_station": "C", "to_station": "D", "from_dt": _dt(11, 40), "to_dt": _dt(12, 10)},
        # Train C (303): M1 on C->D (12:00-12:30)
        {"train_number": 303, "from_station": "C", "to_station": "D", "from_dt": _dt(12), "to_dt": _dt(12, 30)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)

    trace_types = [t.delay_type for t in res.trace]
    assert trace_types == ["DIRECT", "PROPAGATED", "SECONDARY", "PROPAGATED", "SECONDARY"]

    trace_trains = [t.train_number for t in res.trace]
    assert trace_trains == [101, 101, 202, 202, 303]

    assert res.direct_delay_minutes == 20.0
    assert res.secondary_delay_minutes == 30.0  # 10m (train 202) + 20m (train 303)
    assert res.total_delay_minutes == 50.0      # 20 direct + 30 secondary
    assert res.status == "PHASE_2_DETERMINISTIC"


def test_36_accumulated_delay_multiple_events_on_same_train():
    """Verify that multiple events on the same train accumulate without overwriting."""
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        # Train 202 on B->C has precedence over 101's shifted arrival
        {"train_number": 202, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 40), "to_dt": _dt(11, 10)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    m2_traces = [t for t in res.trace if t.train_number == 101 and t.movement_index == 1]
    assert len(m2_traces) == 2
    sec_m2 = [t for t in m2_traces if t.delay_type == "SECONDARY"][0]
    assert sec_m2.delay_minutes == 20.0
    assert sec_m2.shifted_start == "1900-01-01 11:10"
    assert sec_m2.shifted_end == "1900-01-01 11:40"


def test_37_direct_delay_preserved_when_train_sequence_missing():
    """
    Verify that if a directly delayed train is not found in sequence_repo
    (e.g. broken or missing sequence in dataset), its direct delay is STILL:
    1. Counted in direct_delay_minutes
    2. Counted in total_delay_minutes
    3. Recorded in delay_trace as a DIRECT event
    4. Reported with status='PARTIAL' and structured reason 'BROKEN_SEQUENCE'.
    """
    df = pd.DataFrame([
        # Train 999 exists in repo, but train 101 does NOT exist in repo
        {"train_number": 999, "train_type": "EXP", "from_station": "X", "to_station": "Y", "from_dt": _dt(10), "to_dt": _dt(11)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,  # Not in seq_repo!
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)

    # Direct delay must NOT be 0!
    assert res.direct_delay_minutes == 20.0
    assert res.total_delay_minutes == 20.0
    assert res.secondary_delay_minutes == 0.0
    assert res.status == "PARTIAL"
    assert res.structured_reason is not None
    assert res.structured_reason["code"] == "BROKEN_SEQUENCE"

    # Trace must have the DIRECT event
    direct_traces = [t for t in res.trace if t.delay_type == "DIRECT"]
    assert len(direct_traces) == 1
    assert direct_traces[0].train_number == 101
    assert direct_traces[0].delay_minutes == 20.0
    assert direct_traces[0].reason == "DIRECT_MAINTENANCE_BLOCK"


def test_38_explanation_delay_accounting_and_attribution():
    """
    Verify explanation output:
    1. References propagation as a downstream effect / non-additive trace metric.
    2. Does not double count propagated delay into total.
    3. Provides train-level attributable breakdowns.
    """
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        {"train_number": 202, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 50), "to_dt": _dt(11, 20)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)
    window.direct_delay_minutes = res.direct_delay_minutes
    window.propagated_delay_minutes = res.propagated_delay_minutes
    window.secondary_delay_minutes = res.secondary_delay_minutes
    window.cascade_delay_minutes = res.cascade_delay_minutes
    window.total_delay_minutes = res.total_delay_minutes
    window.cascade_status = res.status
    window.impact_score = compute_impact_score(window)
    window.delay_trace = [t.to_dict() for t in res.trace]

    exp = generate_explanation(window, conflicts, [window], "A", "B", 50)
    assert "Total network delay (50.00 min) represents net attributable delay" in exp
    assert "non-additive trace metric" in exp
    assert "Train 101: 20.00 minutes" in exp
    assert "Train 202: 30.00 minutes" in exp


def test_39_repeated_propagation_does_not_increase_attributable_delay():
    """
    Scenario B: Train A has direct +20 and 3 subsequent downstream movements.
    Attributable delay for Train A must remain 20.0, NOT 80.0!
    """
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        {"train_number": 101, "from_station": "C", "to_station": "D", "from_dt": _dt(11, 0), "to_dt": _dt(11, 30)},
        {"train_number": 101, "from_station": "D", "to_station": "E", "from_dt": _dt(11, 30), "to_dt": _dt(12, 0)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)

    # Initial direct block delay
    assert res.direct_delay_minutes == 20.0
    # Downstream propagation metric reflects 3 subsequent shifts (20 + 20 + 20 = 60)
    assert res.propagated_delay_minutes == 60.0
    # Zero secondary conflicts
    assert res.secondary_delay_minutes == 0.0
    # Crucial: Attributable network delay is 20.0, NOT 80.0!
    assert res.total_delay_minutes == 20.0

    window.total_delay_minutes = res.total_delay_minutes
    window.direct_delay_minutes = res.direct_delay_minutes
    # Impact score must be attributable total delay
    assert compute_impact_score(window) == 20.0


def test_40_total_delay_equals_sum_of_attributable_train_delays():
    """
    Scenario C & D: Multi-train cascade scenario.
    Total delay equals the sum of each affected train's final attributable delay.
    """
    df = _make_df([
        {"train_number": 101, "from_station": "A", "to_station": "B", "from_dt": _dt(10), "to_dt": _dt(10, 30)},
        {"train_number": 101, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 30), "to_dt": _dt(11, 0)},
        {"train_number": 202, "from_station": "B", "to_station": "C", "from_dt": _dt(10, 55), "to_dt": _dt(11, 25)},
        {"train_number": 202, "from_station": "C", "to_station": "D", "from_dt": _dt(11, 25), "to_dt": _dt(11, 55)},
    ])
    seq_repo = TrainSequenceRepository(df)
    window = CandidateWindow(start=_dt(9, 30), end=_dt(10, 20))
    conflicts = [
        ConflictRecord(
            train_number=101,
            train_type="EXP",
            from_station="A",
            to_station="B",
            train_entry=_dt(10),
            train_exit=_dt(10, 30),
            overlap_minutes=20.0,
            conflict_type=ConflictType.ENTRY_BLOCKED,
        )
    ]
    res = simulate_cascade_delay(window, conflicts, seq_repo)

    # Train 101: direct=20.0, effective B->C = 10:50 to 11:20
    # Train 202: 10:55 to 11:25. Train 101 has precedence (10:50 < 10:55)
    # Train 202 delayed from 10:55 to 11:20 (101's clearing time) = 25.0m secondary delay
    assert res.direct_delay_minutes == 20.0
    assert res.secondary_delay_minutes == 25.0
    # Net network total delay = Train 101 (20m) + Train 202 (25m) = 45.0m
    assert res.total_delay_minutes == 45.0

    window.total_delay_minutes = res.total_delay_minutes
    window.direct_delay_minutes = res.direct_delay_minutes
    assert compute_impact_score(window) == 45.0



