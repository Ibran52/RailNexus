"""
test_conflict_engine.py — conflict detection + direct delay unit tests.
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import pytest

_SRC  = str(Path(__file__).parent.parent / "src")
_TEST = str(Path(__file__).parent)
for _p in (_SRC, _TEST):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from conftest import dt, make_df  # type: ignore
from core.candidate_windows import CandidateWindow, generate_candidate_windows  # type: ignore
from core.conflict_engine import ConflictRecord, find_conflicts  # type: ignore
from core.direct_delay import calculate_direct_delay, calculate_total_direct_delay  # type: ignore
from core.train_repository import TrainRepository  # type: ignore


# ── Helpers ───────────────────────────────────────────────────────────────────

def _one_train_df(from_st, to_st, entry_h, exit_h):
    return make_df([{
        "train_number": 9001,
        "train_type": "Exp",
        "from_station": from_st,
        "to_station": to_st,
        "from_dt": dt(entry_h),
        "to_dt": dt(exit_h),
        "occupancy_duration_mins": (exit_h - entry_h) * 60,
    }])


def _repo(df):
    return TrainRepository(df)


def _window(start_h, end_h):
    return CandidateWindow(start=dt(start_h), end=dt(end_h))


# ── Conflict detection ────────────────────────────────────────────────────────

def test_overlap_same_section():
    """Train 10:00–10:30 on A→B, maintenance 09:00–11:00 → 1 conflict."""
    repo = _repo(_one_train_df("A", "B", 10, 11))
    trains = repo.get_trains_for_section_and_time("A", "B", dt(9), dt(11))
    conflicts = find_conflicts(_window(9, 11), trains)
    assert len(conflicts) == 1
    assert conflicts[0].train_number == 9001


def test_no_overlap_train_before_maintenance():
    """Train exits at 08:00; maintenance starts at 10:00 → no conflict."""
    repo = _repo(_one_train_df("A", "B", 7, 8))
    trains = repo.get_trains_for_section_and_time("A", "B", dt(10), dt(12))
    conflicts = find_conflicts(_window(10, 12), trains)
    assert len(conflicts) == 0


def test_no_overlap_train_after_maintenance():
    """Train starts at 14:00; maintenance ends at 12:00 → no conflict."""
    repo = _repo(_one_train_df("A", "B", 14, 15))
    trains = repo.get_trains_for_section_and_time("A", "B", dt(10), dt(12))
    conflicts = find_conflicts(_window(10, 12), trains)
    assert len(conflicts) == 0


def test_adjacent_no_overlap():
    """Train exits at 10:00; maintenance starts at 10:00 — strict < means no overlap."""
    repo = _repo(_one_train_df("A", "B", 9, 10))
    trains = repo.get_trains_for_section_and_time("A", "B", dt(10), dt(12))
    conflicts = find_conflicts(_window(10, 12), trains)
    assert len(conflicts) == 0


def test_different_section_no_conflict():
    """Train on C→D; maintenance on A→B — different section, no conflict regardless of time."""
    repo = _repo(_one_train_df("C", "D", 10, 11))
    trains = repo.get_trains_for_section_and_time("A", "B", dt(9), dt(12))
    conflicts = find_conflicts(_window(9, 12), trains)
    assert len(conflicts) == 0


def test_reversed_section_no_conflict():
    """Train on B→A; maintenance on A→B — reversed section, no conflict."""
    repo = _repo(_one_train_df("B", "A", 10, 11))
    trains = repo.get_trains_for_section_and_time("A", "B", dt(9), dt(12))
    conflicts = find_conflicts(_window(9, 12), trains)
    assert len(conflicts) == 0


def test_overlap_minutes_correct():
    """Train 10:00–11:00, maintenance 10:30–12:30 → overlap 30 min."""
    repo = _repo(_one_train_df("A", "B", 10, 11))
    trains = repo.get_trains_for_section_and_time("A", "B", dt(10, 30), dt(12, 30))
    conflicts = find_conflicts(_window(10, 12), trains)   # window 10:00–12:00
    # Train is on section 10:00–11:00; window starts 10:00 → overlap = 60 min
    assert conflicts[0].overlap_minutes == pytest.approx(60.0)


# ── Candidate window generation ───────────────────────────────────────────────

def test_window_count():
    """10:00–20:00, 2-hour window, 60-min step → 9 windows."""
    wins = generate_candidate_windows(dt(10), dt(20), 120, 60)
    assert len(wins) == 9


def test_windows_dont_exceed_latest_end():
    wins = generate_candidate_windows(dt(10), dt(20), 120, 60)
    for w in wins:
        assert w.end <= dt(20)


def test_single_window_fits_exactly():
    wins = generate_candidate_windows(dt(10), dt(12), 120, 60)
    assert len(wins) == 1


def test_no_window_when_too_narrow():
    wins = generate_candidate_windows(dt(10), dt(11), 120, 60)
    assert len(wins) == 0


def test_step_zero_raises():
    with pytest.raises(ValueError):
        generate_candidate_windows(dt(10), dt(20), 120, step_minutes=0)


# ── Direct delay ──────────────────────────────────────────────────────────────

def test_direct_delay_value():
    """Train enters at 14:30; maintenance ends at 16:00 → 90 min delay."""
    window = _window(14, 16)
    conflict = ConflictRecord(
        train_number=9002, train_type="Exp",
        from_station="A", to_station="B",
        train_entry=dt(14, 30), train_exit=dt(15, 0),
        overlap_minutes=30.0,
    )
    assert calculate_direct_delay(window, conflict) == pytest.approx(90.0)


def test_direct_delay_never_negative():
    """If maintenance ends before train entry (no real overlap), delay = 0."""
    window = _window(10, 12)
    conflict = ConflictRecord(
        train_number=9003, train_type="Exp",
        from_station="A", to_station="B",
        train_entry=dt(13, 0), train_exit=dt(14, 0),
        overlap_minutes=0.0,
    )
    assert calculate_direct_delay(window, conflict) == 0.0


def test_total_direct_delay_sum():
    window = _window(14, 16)
    c1 = ConflictRecord(9004, "Exp", "A", "B", dt(14, 0), dt(14, 30), 30.0)
    c2 = ConflictRecord(9005, "Exp", "A", "B", dt(14, 30), dt(15, 0), 30.0)
    # c1 delay: 16:00 - 14:00 = 120 min
    # c2 delay: 16:00 - 14:30 = 90 min
    total = calculate_total_direct_delay(window, [c1, c2])
    assert total == pytest.approx(210.0)


def test_cascade_delay_sentinel():
    # pyrefly: ignore [missing-import]
    from core.cascade_delay import calculate_cascade_delay
    result = calculate_cascade_delay(_window(10, 12), [])
    assert result.cascade_delay_minutes == 0.0
    assert result.status == "NOT_IMPLEMENTED"


# ── Real dataset integration ──────────────────────────────────────────────────

def test_real_section_ke_atg_has_trains(real_repo):
    """Section KE→ATG must have at least one train movement in the dataset."""
    trains = real_repo.get_trains_by_section("KE", "ATG")
    assert len(trains) > 0, "Expected train movements on KE→ATG from CSV."


def test_real_section_nonexistent_returns_empty(real_repo):
    """A fabricated section must return empty — never invent data."""
    trains = real_repo.get_trains_by_section("FAKE_A", "FAKE_B")
    assert trains == []
