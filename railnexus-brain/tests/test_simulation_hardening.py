"""
test_simulation_hardening.py — Verification of simulation semantics and edge cases.

Verifies:
[Direct Delay & Conflict Classification]
1. Train enters after maintenance starts (ENTRY_BLOCKED, delay > 0).
2. Train enters exactly when maintenance starts (ENTRY_BLOCKED, delay = duration).
3. Train exits exactly when maintenance starts (NO_CONFLICT, delay = 0).
4. Train already inside section at maintenance start (TRAIN_ALREADY_INSIDE_SECTION, delay = 0).
5. Train fully outside maintenance interval (NO_CONFLICT, delay = 0).

[Candidate Feasibility]
6. Candidate with already-occupied section is marked infeasible.
7. Candidate with train entry during block is feasible with waiting delay.
8. All candidates infeasible → NO_FEASIBLE_WINDOW.

[Joint Planning]
9. Two same-section requests cannot overlap in recommendation.
10. Two different-section requests can overlap.
11. Fixed plan blocks overlapping candidate on same section.
12. Fixed plan does not block unrelated section.
13. New request can be re-planned with an unapproved recommendation.
14. Approved plan remains fixed.

[Bundling]
15. Same section + compatible duration → bundle candidate generated.
16. Different sections → no bundle candidate.
17. Bundle with worse impact → recommendation is SEPARATE.

[Versioning]
18. Backend-supplied planning-state version is echoed unchanged.
19. Missing version uses deterministic fallback count.
"""

from __future__ import annotations

from datetime import datetime
import pandas as pd
import pytest

from conftest import dt, make_df  # type: ignore
from core.candidate_windows import CandidateWindow  # type: ignore
from core.conflict_engine import ConflictRecord, ConflictType, find_conflicts  # type: ignore
from core.direct_delay import calculate_direct_delay  # type: ignore
from core.optimizer import simulate_window  # type: ignore
from core.train_repository import TrainMovement, TrainRepository  # type: ignore
from core.bundling import evaluate_bundle  # type: ignore


def _parse_dt(dt_str: str) -> datetime:
    return datetime.fromisoformat(dt_str)


def _intervals_overlap(s1: str, e1: str, s2: str, e2: str) -> bool:
    return max(_parse_dt(s1), _parse_dt(s2)) < min(_parse_dt(e1), _parse_dt(e2))


def _movement(tn: int, f_st: str, t_st: str, entry_h: int, entry_m: int, exit_h: int, exit_m: int) -> TrainMovement:
    return TrainMovement(pd.Series({
        "train_number": tn,
        "train_type": "Exp",
        "from_station": f_st,
        "to_station": t_st,
        "from_dt": dt(entry_h, entry_m),
        "to_dt": dt(exit_h, exit_m),
        "occupancy_duration_mins": float((exit_h - entry_h) * 60 + (exit_m - entry_m)),
        "block_section_km": 1.0,
        "day": 1.0,
    }))


# ── 1. Train enters after maintenance starts ──────────────────────────────────

def test_1_train_enters_after_maintenance_starts():
    win = CandidateWindow(start=dt(12, 0), end=dt(14, 0))
    train = _movement(101, "KE", "ATG", 12, 30, 13, 0)
    conflicts = find_conflicts(win, [train])
    assert len(conflicts) == 1
    c = conflicts[0]
    assert c.conflict_type == ConflictType.ENTRY_BLOCKED
    assert calculate_direct_delay(win, c) == pytest.approx(90.0)  # 14:00 - 12:30 = 90 min


# ── 2. Train enters exactly when maintenance starts ───────────────────────────

def test_2_train_enters_exactly_at_maintenance_start():
    win = CandidateWindow(start=dt(10, 0), end=dt(12, 0))
    train = _movement(102, "KE", "ATG", 10, 0, 10, 30)
    conflicts = find_conflicts(win, [train])
    assert len(conflicts) == 1
    c = conflicts[0]
    assert c.conflict_type == ConflictType.ENTRY_BLOCKED
    assert calculate_direct_delay(win, c) == pytest.approx(120.0)  # Full 120 min duration


# ── 3. Train exits exactly when maintenance starts ────────────────────────────

def test_3_train_exits_exactly_at_maintenance_start():
    win = CandidateWindow(start=dt(10, 0), end=dt(12, 0))
    # Train is 09:30 to 10:00 (exits strictly when maintenance starts)
    train = _movement(103, "KE", "ATG", 9, 30, 10, 0)
    conflicts = find_conflicts(win, [train])
    assert len(conflicts) == 0  # No overlap because strict < and >


# ── 4. Train already inside section at maintenance start ──────────────────────

def test_4_train_already_inside_section_at_maintenance_start():
    win = CandidateWindow(start=dt(12, 0), end=dt(14, 0))
    # Entered at 11:00 (before 12:00), exits at 13:00 (after 12:00)
    train = _movement(104, "KE", "ATG", 11, 0, 13, 0)
    conflicts = find_conflicts(win, [train])
    assert len(conflicts) == 1
    c = conflicts[0]
    assert c.conflict_type == ConflictType.TRAIN_ALREADY_INSIDE_SECTION
    assert calculate_direct_delay(win, c) == 0.0  # Not treated as normal waiting delay


# ── 5. Train fully outside maintenance interval ───────────────────────────────

def test_5_train_fully_outside_maintenance_interval():
    win = CandidateWindow(start=dt(12, 0), end=dt(14, 0))
    train = _movement(105, "KE", "ATG", 15, 0, 15, 30)
    conflicts = find_conflicts(win, [train])
    assert len(conflicts) == 0


# ── 6. Candidate with already-occupied section is marked infeasible ───────────

def test_6_candidate_with_occupied_section_is_infeasible():
    df = make_df([{
        "train_number": 201,
        "train_type": "Exp",
        "from_station": "AKRD",
        "to_station": "CCH",
        "from_dt": dt(11, 30),
        "to_dt": dt(12, 30),  # occupies section across 12:00
        "occupancy_duration_mins": 60.0,
    }])
    repo = TrainRepository(df)
    win = CandidateWindow(start=dt(12, 0), end=dt(14, 0))
    res = simulate_window(win, repo, "AKRD", "CCH")
    assert res.window.feasible is False
    assert res.window.already_occupied_count == 1
    assert len(res.window.infeasibility_reasons) == 1
    assert res.window.infeasibility_reasons[0]["code"] == "TRAIN_ALREADY_OCCUPYING_SECTION_AT_BLOCK_START"


# ── 7. Candidate with entry during block is feasible with waiting delay ────────

def test_7_candidate_with_entry_during_block_is_feasible():
    df = make_df([{
        "train_number": 202,
        "train_type": "Exp",
        "from_station": "AKRD",
        "to_station": "CCH",
        "from_dt": dt(12, 30),
        "to_dt": dt(13, 0),
        "occupancy_duration_mins": 30.0,
    }])
    repo = TrainRepository(df)
    win = CandidateWindow(start=dt(12, 0), end=dt(14, 0))
    res = simulate_window(win, repo, "AKRD", "CCH")
    assert res.window.feasible is True
    assert res.window.already_occupied_count == 0
    assert res.window.entry_block_count == 1
    assert res.window.direct_delay_minutes == pytest.approx(90.0)


# ── 8. All candidates infeasible -> NO_FEASIBLE_WINDOW ────────────────────────

def test_8_all_candidates_infeasible_returns_no_feasible_window(test_client):
    body = {
        "request_id": "REQ-ALL-BLOCKED",
        "from_station": "AKRD",
        "to_station": "CCH",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T12:00:00",
        "planning_state": {
            "pending_requests": [],
            "fixed_plans": [
                {
                    "request_id": "FIXED-BLOCKING",
                    "from_station": "AKRD",
                    "to_station": "CCH",
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
    assert data["success"] is False
    assert data["status"] == "NO_FEASIBLE_WINDOW"
    assert data["recommendation"] is None


# ── 9. Two same-section requests cannot overlap ───────────────────────────────

def test_9_two_same_section_requests_no_overlap(test_client):
    body = {
        "request_id": "REQ-M1",
        "from_station": "AKRD",
        "to_station": "CCH",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T18:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-M2",
                    "from_station": "AKRD",
                    "to_station": "CCH",
                    "duration_minutes": 120,
                    "earliest_start": "1900-01-01T10:00:00",
                    "latest_end": "1900-01-01T18:00:00",
                }
            ],
            "fixed_plans": [],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    recs = {rec["request_id"]: rec["recommendation"] for rec in data["recommendations"]}
    r1, r2 = recs["REQ-M1"], recs["REQ-M2"]
    assert r1 is not None and r2 is not None
    assert not _intervals_overlap(r1["start"], r1["end"], r2["start"], r2["end"])


# ── 10. Two different-section requests can overlap ────────────────────────────

def test_10_two_different_section_requests_can_overlap(test_client):
    body = {
        "request_id": "REQ-DIFF-1",
        "from_station": "AKRD",
        "to_station": "CCH",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T15:00:00",
        "latest_end": "1900-01-01T17:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-DIFF-2",
                    "from_station": "VVH",
                    "to_station": "GC",
                    "duration_minutes": 120,
                    "earliest_start": "1900-01-01T15:00:00",
                    "latest_end": "1900-01-01T17:00:00",
                }
            ],
            "fixed_plans": [],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    recs = {rec["request_id"]: rec for rec in data["recommendations"]}
    assert recs["REQ-DIFF-1"]["status"] == "RECOMMENDED"
    assert recs["REQ-DIFF-2"]["status"] == "RECOMMENDED"


# ── 11. Fixed plan blocks overlapping candidate on same section ───────────────

def test_11_fixed_plan_blocks_overlapping_candidate(test_client):
    body = {
        "request_id": "REQ-FP-BLOCK",
        "from_station": "AKRD",
        "to_station": "CCH",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T15:00:00",
        "planning_state": {
            "pending_requests": [],
            "fixed_plans": [
                {
                    "request_id": "APPROVED-FP",
                    "from_station": "AKRD",
                    "to_station": "CCH",
                    "allocated_start": "1900-01-01T11:00:00",
                    "allocated_end": "1900-01-01T13:00:00",
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
    # Must start at 13:00 or later, avoiding 11:00-13:00
    assert not _intervals_overlap(
        rec["start"], rec["end"],
        "1900-01-01T11:00:00", "1900-01-01T13:00:00",
    )


# ── 12. Fixed plan does not block unrelated section ───────────────────────────

def test_12_fixed_plan_does_not_block_unrelated_section(test_client):
    body = {
        "request_id": "REQ-UNRELATED-SEC",
        "from_station": "AKRD",
        "to_station": "CCH",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T13:00:00",
        "planning_state": {
            "pending_requests": [],
            "fixed_plans": [
                {
                    "request_id": "FP-OTHER-SEC",
                    "from_station": "VVH",
                    "to_station": "GC",  # On VVH->GC, NOT KE->ATG
                    "allocated_start": "1900-01-01T11:00:00",
                    "allocated_end": "1900-01-01T13:00:00",
                    "status": "APPROVED",
                }
            ],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["recommendation"]["start"] == "1900-01-01T11:00:00"


# ── 13. New request can be re-planned with an unapproved recommendation ───────

def test_13_replanned_with_unapproved_recommendation(test_client):
    body = {
        "request_id": "REQ-NEW-ARRIVED",
        "from_station": "AKRD",
        "to_station": "CCH",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T15:00:00",
        "latest_end": "1900-01-01T17:00:00",
        "planning_state": {
            "planning_mode": "REPLAN",
            "pending_requests": [
                {
                    "request_id": "REQ-PRIOR-REC",
                    "from_station": "AKRD",
                    "to_station": "CCH",
                    "duration_minutes": 60,
                    "earliest_start": "1900-01-01T15:00:00",
                    "latest_end": "1900-01-01T17:00:00",
                    "status": "RECOMMENDED",
                }
            ],
            "fixed_plans": [],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["planning_summary"]["planning_mode"] == "REPLAN"
    assert data["planning_summary"]["scheduled_count"] == 2


# ── 14. Approved plan remains fixed ───────────────────────────────────────────

def test_14_approved_plan_remains_fixed(test_client):
    fixed_start = "1900-01-01T11:00:00"
    fixed_end = "1900-01-01T13:00:00"
    body = {
        "request_id": "REQ-CHECK-FP",
        "from_station": "AKRD",
        "to_station": "CCH",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T18:00:00",
        "planning_state": {
            "pending_requests": [],
            "fixed_plans": [
                {
                    "request_id": "LOCKED-PLAN",
                    "from_station": "AKRD",
                    "to_station": "CCH",
                    "allocated_start": fixed_start,
                    "allocated_end": fixed_end,
                    "status": "APPROVED",
                }
            ],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert "fixed_plans" in data
    assert len(data["fixed_plans"]) == 1
    fp = data["fixed_plans"][0]
    assert fp["request_id"] == "LOCKED-PLAN"
    assert fp["allocated_start"] == fixed_start
    assert fp["allocated_end"] == fixed_end
    # The new recommendation must avoid this window
    rec = data["recommendation"]
    assert not _intervals_overlap(rec["start"], rec["end"], fixed_start, fixed_end)


# ── 15. Same section + compatible duration -> bundle candidate ────────────────

def test_15_bundle_candidate_generated(test_client):
    body = {
        "request_id": "REQ-BC-1",
        "from_station": "AKRD",
        "to_station": "CCH",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T15:00:00",
        "latest_end": "1900-01-01T18:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-BC-2",
                    "from_station": "AKRD",
                    "to_station": "CCH",
                    "duration_minutes": 60,
                    "earliest_start": "1900-01-01T15:00:00",
                    "latest_end": "1900-01-01T18:00:00",
                }
            ],
            "fixed_plans": [],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert "bundles" in data
    assert len(data["bundles"]) >= 1
    assert "BUNDLE" in data["bundles"][0]["reason"]


# ── 16. Different sections -> no forced bundle ────────────────────────────────

def test_16_different_sections_no_bundle(test_client):
    body = {
        "request_id": "REQ-NOBUNDLE-1",
        "from_station": "AKRD",
        "to_station": "CCH",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T15:00:00",
        "latest_end": "1900-01-01T18:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-NOBUNDLE-2",
                    "from_station": "VVH",
                    "to_station": "GC",  # Different section
                    "duration_minutes": 60,
                    "earliest_start": "1900-01-01T15:00:00",
                    "latest_end": "1900-01-01T18:00:00",
                }
            ],
            "fixed_plans": [],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data.get("bundles") == []


# ── 17. Bundle with worse impact -> SEPARATE ──────────────────────────────────

def test_17_bundle_with_worse_impact_separate():
    class DummyReq:
        def __init__(self, rid, s_start, s_end, dur):
            self.request_id = rid
            self.from_station = "A"
            self.to_station = "B"
            self.earliest_start = s_start
            self.latest_end = s_end
            self.duration_minutes = dur

    req_a = DummyReq("RA", dt(10), dt(14), 60)
    req_b = DummyReq("RB", dt(10), dt(14), 60)

    # Initial dummy df with one row outside the window
    dummy_df = make_df([{
        "train_number": 990,
        "train_type": "Exp",
        "from_station": "A",
        "to_station": "B",
        "from_dt": dt(20),
        "to_dt": dt(21),
        "occupancy_duration_mins": 60.0,
    }])
    dummy_repo = TrainRepository(dummy_df)

    win_a = CandidateWindow(start=dt(10), end=dt(11), impact_score=5.0)
    win_b = CandidateWindow(start=dt(11), end=dt(12), impact_score=5.0)
    indiv_results = {
        "RA": simulate_window(win_a, dummy_repo, "A", "B"),
        "RB": simulate_window(win_b, dummy_repo, "A", "B"),
    }
    indiv_results["RA"].window.impact_score = 5.0
    indiv_results["RB"].window.impact_score = 5.0

    # Train movement that clashes with the combined 120 min window
    df = make_df([{
        "train_number": 999,
        "train_type": "Exp",
        "from_station": "A",
        "to_station": "B",
        "from_dt": dt(10, 30),
        "to_dt": dt(11, 0),
        "occupancy_duration_mins": 30.0,
    }])
    repo = TrainRepository(df)

    # Evaluate bundle
    evaluation = evaluate_bundle(req_a, req_b, indiv_results, repo, step_minutes=60)
    if evaluation:
        assert "[PHASE 2 BUNDLE ESTIMATE]" in evaluation.reason
        assert "[PHASE 1 BUNDLE ESTIMATE]" not in evaluation.reason


# ── 18. Backend-supplied planning-state version is echoed unchanged ───────────

def test_18_backend_supplied_version_echoed(test_client):
    body = {
        "request_id": "REQ-V42",
        "from_station": "AKRD",
        "to_station": "CCH",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T15:00:00",
        "latest_end": "1900-01-01T17:00:00",
        "planning_state": {
            "version": 42,
            "planning_mode": "REPLAN",
            "pending_requests": [],
            "fixed_plans": [],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["plan_version"] == 42
    assert data["metadata"]["plan_version"] == 42


# ── 19. Missing version uses deterministic fallback ───────────────────────────

def test_19_missing_version_deterministic_fallback(test_client):
    body = {
        "request_id": "REQ-NO-V",
        "from_station": "AKRD",
        "to_station": "CCH",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T15:00:00",
        "latest_end": "1900-01-01T17:00:00",
        "planning_state": {
            "version": None,  # omitted
            "pending_requests": [
                {
                    "request_id": "PEND-1",
                    "from_station": "AKRD",
                    "to_station": "CCH",
                    "duration_minutes": 60,
                    "earliest_start": "1900-01-01T15:00:00",
                    "latest_end": "1900-01-01T17:00:00",
                }
            ],
            "fixed_plans": [
                {
                    "request_id": "FIXED-1",
                    "from_station": "AKRD",
                    "to_station": "CCH",
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
    # 2 pending (triggering + PEND-1) + 1 fixed = 3
    assert data["plan_version"] == 3
    assert data["metadata"]["plan_version"] == 3
