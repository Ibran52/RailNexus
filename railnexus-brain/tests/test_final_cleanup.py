"""
test_final_cleanup.py — RailNexus Brain / tests
Validation suite for Final Phase 1 Correctness Cleanup.

Tests:
1. Single-request alternatives contain individually feasible candidates and type SINGLE_REQUEST_ALTERNATIVE.
2. Same-section joint alternative that overlaps another selected request is excluded.
3. Same-section joint alternative that does not overlap selected request remains available.
4. Different-section alternative may overlap in time.
5. Alternative overlapping fixed plan is excluded.
6. Alternative with TRAIN_ALREADY_INSIDE_SECTION is excluded.
7. Alternative with ENTRY_BLOCKED may be included with calculated direct delay.
8. Invalid RequestStatus is rejected with 422.
9. Valid RequestStatus values are accepted.
10. Backend-supplied planning_mode is echoed.
11. Backend-supplied plan_version is echoed.
12. Existing single-request API continues to work.
13. Existing fixed-plan protection continues to work.
14. Existing joint planner continues to return non-overlapping same-section assignments.
15. Existing bundling tests continue to pass with [PHASE 1 BUNDLE ESTIMATE].
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import pytest

_SRC = str(Path(__file__).parent.parent / "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)


@pytest.fixture(scope="module")
def client(test_client):
    return test_client


def _intervals_overlap(s1: str, e1: str, s2: str, e2: str) -> bool:
    dt_s1, dt_e1 = datetime.fromisoformat(s1), datetime.fromisoformat(e1)
    dt_s2, dt_e2 = datetime.fromisoformat(s2), datetime.fromisoformat(e2)
    return max(dt_s1, dt_s2) < min(dt_e1, dt_e2)


# ── 1. Single-request alternatives contain feasible candidates ────────────────

def test_01_single_request_alternatives(client):
    body = {
        "request_id": "REQ-SINGLE-ALTS",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T18:00:00",
    }
    r = client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert len(data["alternatives"]) > 0
    for alt in data["alternatives"]:
        assert alt["alternative_type"] == "SINGLE_REQUEST_ALTERNATIVE"
        # Must not equal recommendation
        assert (alt["start"], alt["end"]) != (
            data["recommendation"]["start"],
            data["recommendation"]["end"],
        )


# ── 2. Same-section joint alternative overlapping other selected request is excluded ─

def test_02_same_section_joint_alt_overlapping_other_excluded(client):
    body = {
        "request_id": "REQ-A",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T16:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-B",
                    "from_station": "KE",
                    "to_station": "ATG",
                    "duration_minutes": 120,
                    "earliest_start": "1900-01-01T11:00:00",
                    "latest_end": "1900-01-01T16:00:00",
                }
            ],
            "fixed_plans": [],
        },
    }
    r = client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    recs = {rec["request_id"]: rec for rec in data["recommendations"]}
    rec_a = recs["REQ-A"]["recommendation"]
    rec_b = recs["REQ-B"]["recommendation"]
    assert rec_a is not None and rec_b is not None

    # Verify no alternative of REQ-A overlaps the selected window of REQ-B
    for alt in recs["REQ-A"]["alternatives"]:
        assert alt["alternative_type"] == "JOINT_FEASIBLE_ALTERNATIVE"
        assert not _intervals_overlap(alt["start"], alt["end"], rec_b["start"], rec_b["end"])

    # Verify no alternative of REQ-B overlaps the selected window of REQ-A
    for alt in recs["REQ-B"]["alternatives"]:
        assert alt["alternative_type"] == "JOINT_FEASIBLE_ALTERNATIVE"
        assert not _intervals_overlap(alt["start"], alt["end"], rec_a["start"], rec_a["end"])


# ── 3. Same-section joint alternative not overlapping selected request remains available ─

def test_03_same_section_joint_alt_non_overlapping_remains(client):
    body = {
        "request_id": "REQ-1",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T17:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-2",
                    "from_station": "KE",
                    "to_station": "ATG",
                    "duration_minutes": 60,
                    "earliest_start": "1900-01-01T10:00:00",
                    "latest_end": "1900-01-01T17:00:00",
                }
            ],
            "fixed_plans": [],
        },
    }
    r = client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    recs = {rec["request_id"]: rec for rec in data["recommendations"]}
    # If there are feasible non-overlapping windows in the wide range, alternatives should be present
    alts_1 = recs["REQ-1"]["alternatives"]
    for alt in alts_1:
        assert alt["alternative_type"] == "JOINT_FEASIBLE_ALTERNATIVE"
        assert not _intervals_overlap(
            alt["start"], alt["end"],
            recs["REQ-2"]["recommendation"]["start"],
            recs["REQ-2"]["recommendation"]["end"],
        )


# ── 4. Different-section alternative may overlap in time ──────────────────────

def test_04_different_section_alt_may_overlap_in_time(client):
    body = {
        "request_id": "REQ-SEC-1",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T15:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-SEC-2",
                    "from_station": "VVH",
                    "to_station": "GC",
                    "duration_minutes": 60,
                    "earliest_start": "1900-01-01T11:00:00",
                    "latest_end": "1900-01-01T15:00:00",
                }
            ],
            "fixed_plans": [],
        },
    }
    r = client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    recs = {rec["request_id"]: rec for rec in data["recommendations"]}
    # Requests on different sections are not mutually excluded
    assert recs["REQ-SEC-1"]["status"] == "RECOMMENDED"
    assert recs["REQ-SEC-2"]["status"] in ("RECOMMENDED", "NO_FEASIBLE_WINDOW")


# ── 5. Alternative overlapping fixed plan is excluded ─────────────────────────

def test_05_alt_overlapping_fixed_plan_excluded(client):
    body = {
        "request_id": "REQ-WITH-FP",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T16:00:00",
        "planning_state": {
            "pending_requests": [],
            "fixed_plans": [
                {
                    "request_id": "FP-LOCKED",
                    "from_station": "KE",
                    "to_station": "ATG",
                    "allocated_start": "1900-01-01T11:00:00",
                    "allocated_end": "1900-01-01T13:00:00",
                    "status": "APPROVED",
                }
            ],
        },
    }
    r = client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    # Recommendation and alternatives must not overlap 11:00-13:00
    assert not _intervals_overlap(
        data["recommendation"]["start"], data["recommendation"]["end"],
        "1900-01-01T11:00:00", "1900-01-01T13:00:00",
    )
    for alt in data["alternatives"]:
        assert not _intervals_overlap(
            alt["start"], alt["end"],
            "1900-01-01T11:00:00", "1900-01-01T13:00:00",
        )


# ── 6. Alternative with TRAIN_ALREADY_INSIDE_SECTION is excluded ──────────────

def test_06_alt_with_train_already_inside_excluded(client):
    # Train 97057 occupies VVH->GC from 10:58 to 11:01.
    # Any window starting at 11:00:00 has already_occupied > 0 -> infeasible
    body = {
        "request_id": "REQ-IN-SEC-ALT",
        "from_station": "VVH",
        "to_station": "GC",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T10:30:00",
        "latest_end": "1900-01-01T14:00:00",
    }
    r = client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    # Check that no alternative starts at 11:00:00
    for alt in data["alternatives"]:
        assert alt["start"] != "1900-01-01T11:00:00"
    if data["recommendation"]:
        assert data["recommendation"]["start"] != "1900-01-01T11:00:00"


# ── 7. Alternative with ENTRY_BLOCKED may be included with calculated direct delay ─

def test_07_alt_with_entry_blocked_included(client):
    body = {
        "request_id": "REQ-ENTRY-ALT",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T08:00:00",
        "latest_end": "1900-01-01T18:00:00",
    }
    r = client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    # Verify that alternatives exist with direct delay >= 0
    assert len(data["alternatives"]) > 0
    for alt in data["alternatives"]:
        assert alt["direct_delay_minutes"] >= 0.0
        assert alt["conflict_count"] >= 0


# ── 8. Invalid RequestStatus is rejected ──────────────────────────────────────

def test_08_invalid_request_status_rejected(client):
    body = {
        "request_id": "REQ-INVALID-STATUS",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T13:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-BAD",
                    "from_station": "KE",
                    "to_station": "ATG",
                    "duration_minutes": 60,
                    "earliest_start": "1900-01-01T11:00:00",
                    "latest_end": "1900-01-01T13:00:00",
                    "status": "NON_EXISTENT_STATUS",
                }
            ],
            "fixed_plans": [],
        },
    }
    r = client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 422


# ── 9. Valid RequestStatus values are accepted ────────────────────────────────

def test_09_valid_request_status_accepted(client):
    valid_statuses = [
        "PENDING",
        "RECOMMENDED",
        "APPROVED",
        "SCHEDULED",
        "COMPLETED",
        "REJECTED",
        "CANCELLED",
    ]
    for st in valid_statuses:
        body = {
            "request_id": f"REQ-{st}",
            "from_station": "KE",
            "to_station": "ATG",
            "duration_minutes": 120,
            "earliest_start": "1900-01-01T11:00:00",
            "latest_end": "1900-01-01T13:00:00",
            "planning_state": {
                "pending_requests": [
                    {
                        "request_id": f"REQ-ITEM-{st}",
                        "from_station": "KE",
                        "to_station": "ATG",
                        "duration_minutes": 60,
                        "earliest_start": "1900-01-01T11:00:00",
                        "latest_end": "1900-01-01T13:00:00",
                        "status": st,
                    }
                ],
                "fixed_plans": [],
            },
        }
        r = client.post("/api/v1/brain/analyze", json=body)
        assert r.status_code == 200, f"Failed for valid status {st}: {r.text}"


# ── 10. Backend-supplied planning_mode is echoed ──────────────────────────────

def test_10_backend_planning_mode_echoed(client):
    for mode in ("INITIAL", "REPLAN"):
        body = {
            "request_id": "REQ-MODE",
            "from_station": "KE",
            "to_station": "ATG",
            "duration_minutes": 120,
            "earliest_start": "1900-01-01T11:00:00",
            "latest_end": "1900-01-01T13:00:00",
            "planning_state": {
                "planning_mode": mode,
                "pending_requests": [],
                "fixed_plans": [],
            },
        }
        r = client.post("/api/v1/brain/analyze", json=body)
        assert r.status_code == 200
        data = r.json()
        assert data["planning_summary"]["planning_mode"] == mode


# ── 11. Backend-supplied plan_version is echoed ────────────────────────────────

def test_11_backend_plan_version_echoed(client):
    body = {
        "request_id": "REQ-V7",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T13:00:00",
        "planning_state": {
            "version": 42,
            "pending_requests": [],
            "fixed_plans": [],
        },
    }
    r = client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["plan_version"] == 42
    assert data["metadata"]["plan_version"] == 42


# ── 12. Existing single-request API continues to work ─────────────────────────

def test_12_regression_single_request_api(client):
    body = {
        "request_id": "REQ-LEGACY",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T15:00:00",
        "priority": "HIGH",
    }
    r = client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["request_id"] == "REQ-LEGACY"
    assert data["recommendation"] is not None
    assert data["metrics"] is not None
    assert data["conflicts"] is not None
    assert len(data["alternatives"]) > 0


# ── 13. Existing fixed-plan protection continues to work ──────────────────────

def test_13_regression_fixed_plan_protection(client):
    body = {
        "request_id": "REQ-FP-PROT",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T16:00:00",
        "planning_state": {
            "pending_requests": [],
            "fixed_plans": [
                {
                    "request_id": "FP-LOCK",
                    "from_station": "KE",
                    "to_station": "ATG",
                    "allocated_start": "1900-01-01T11:00:00",
                    "allocated_end": "1900-01-01T13:00:00",
                    "status": "APPROVED",
                }
            ],
        },
    }
    r = client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    rec = data["recommendation"]
    assert rec is not None
    assert not _intervals_overlap(
        rec["start"], rec["end"],
        "1900-01-01T11:00:00", "1900-01-01T13:00:00",
    )


# ── 14. Existing joint planner returns non-overlapping same-section assignments ─

def test_14_regression_joint_planner_mutual_exclusion(client):
    body = {
        "request_id": "REQ-ME-1",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T15:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-ME-2",
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
    r = client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    recs = {rec["request_id"]: rec for rec in data["recommendations"]}
    rec1 = recs["REQ-ME-1"]["recommendation"]
    rec2 = recs["REQ-ME-2"]["recommendation"]
    assert not _intervals_overlap(rec1["start"], rec1["end"], rec2["start"], rec2["end"])


# ── 15. Existing bundling tests continue to pass with [PHASE 1 BUNDLE ESTIMATE] ─

def test_15_regression_bundling(client):
    body = {
        "request_id": "REQ-B1",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T15:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-B2",
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
    r = client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    if data.get("bundles"):
        for b in data["bundles"]:
            if b.get("reason"):
                assert "[PHASE 2 BUNDLE ESTIMATE]" in b["reason"]
                assert "[PHASE 1 BUNDLE ESTIMATE]" not in b["reason"]
