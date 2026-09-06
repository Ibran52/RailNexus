"""
test_planning_state.py — Integration tests for RailNexus Brain dynamic planning state.

Verifies:
1. Single request with empty planning_state works immediately.
2. Two requests on the same section do NOT have overlapping windows (mutual exclusion).
3. Fixed plans (APPROVED/SCHEDULED) are protected and avoided.
4. Re-planning: newly arriving request triggers joint re-optimization.
5. Sequential arrival simulation (A -> A+B -> A+B+C) maintains consistent state.
6. Deduplication: duplicate request IDs in triggering vs pending state are unified.
7. Partial planning: one request unfeasible while others are successfully scheduled.
8. Post-planning bundle opportunity detection.
9. Different sections are planned independently without false mutual exclusions.
10. Backend-owned version and planning_mode are preserved and echoed.
"""

from __future__ import annotations

from datetime import datetime
import pytest


def _parse_dt(dt_str: str) -> datetime:
    return datetime.fromisoformat(dt_str)


def _intervals_overlap(s1: str, e1: str, s2: str, e2: str) -> bool:
    return max(_parse_dt(s1), _parse_dt(s2)) < min(_parse_dt(e1), _parse_dt(e2))


# ── Scenario 1: Single request with empty planning state ──────────────────────

def test_single_request_empty_planning_state(test_client):
    body = {
        "request_id": "REQ-S1",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T20:00:00",
        "priority": "MEDIUM",
        "planning_state": {
            "pending_requests": [],
            "fixed_plans": [],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["status"] == "ANALYZED"
    assert data["recommendation"] is not None
    assert data["plan_version"] == 1
    assert data["planning_summary"]["scheduled_count"] == 1
    assert len(data["recommendations"]) == 1


# ── Scenario 2: Two requests on same section mutual exclusion ────────────────

def test_two_requests_same_section_no_overlap(test_client):
    body = {
        "request_id": "REQ-A",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T16:00:00",
        "priority": "HIGH",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-B",
                    "from_station": "KE",
                    "to_station": "ATG",
                    "duration_minutes": 120,
                    "earliest_start": "1900-01-01T10:00:00",
                    "latest_end": "1900-01-01T16:00:00",
                    "priority": "MEDIUM",
                    "status": "PENDING",
                }
            ],
            "fixed_plans": [],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    recs = {rec["request_id"]: rec for rec in data["recommendations"]}
    assert "REQ-A" in recs and "REQ-B" in recs

    rec_a = recs["REQ-A"]["recommendation"]
    rec_b = recs["REQ-B"]["recommendation"]
    assert rec_a is not None
    assert rec_b is not None

    # Crucial check: REQ-A and REQ-B must NOT overlap on section KE->ATG
    assert not _intervals_overlap(rec_a["start"], rec_a["end"], rec_b["start"], rec_b["end"])


# ── Scenario 3: Fixed plan protection ─────────────────────────────────────────

def test_fixed_plan_protection(test_client):
    # Fixed plan locked at 10:00 to 12:00 on KE->ATG
    body = {
        "request_id": "REQ-NEW",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T18:00:00",
        "priority": "HIGH",
        "planning_state": {
            "pending_requests": [],
            "fixed_plans": [
                {
                    "request_id": "REQ-FIXED-01",
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
    # Must not overlap with the approved window 10:00-12:00
    assert not _intervals_overlap(
        rec["start"], rec["end"],
        "1900-01-01T10:00:00", "1900-01-01T12:00:00",
    )


# ── Scenario 4: Re-planning when new request arrives ──────────────────────────

def test_replanning_joint_reoptimization(test_client):
    # REQ-A was previously RECOMMENDED, now REQ-B arrives
    body = {
        "request_id": "REQ-B",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T12:00:00",
        "latest_end": "1900-01-01T16:00:00",
        "priority": "HIGH",
        "planning_state": {
            "planning_mode": "REPLAN",
            "pending_requests": [
                {
                    "request_id": "REQ-A",
                    "from_station": "KE",
                    "to_station": "ATG",
                    "duration_minutes": 60,
                    "earliest_start": "1900-01-01T12:00:00",
                    "latest_end": "1900-01-01T16:00:00",
                    "priority": "HIGH",
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

    recs = {rec["request_id"]: rec for rec in data["recommendations"]}
    rec_a = recs["REQ-A"]["recommendation"]
    rec_b = recs["REQ-B"]["recommendation"]
    assert rec_a is not None and rec_b is not None
    assert not _intervals_overlap(rec_a["start"], rec_a["end"], rec_b["start"], rec_b["end"])


# ── Scenario 5: Sequential arrival simulation (A -> A+B -> A+B+C) ─────────────

def test_sequential_arrival_simulation(test_client):
    # Step 1: Request A arrives alone
    r1 = test_client.post("/api/v1/brain/analyze", json={
        "request_id": "REQ-1",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T18:00:00",
    })
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["success"] is True

    # Step 2: Request B arrives at 3:00 PM
    r2 = test_client.post("/api/v1/brain/analyze", json={
        "request_id": "REQ-2",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T18:00:00",
        "planning_state": {
            "planning_mode": "REPLAN",
            "pending_requests": [
                {
                    "request_id": "REQ-1",
                    "from_station": "KE",
                    "to_station": "ATG",
                    "duration_minutes": 60,
                    "earliest_start": "1900-01-01T10:00:00",
                    "latest_end": "1900-01-01T18:00:00",
                    "status": "RECOMMENDED",
                }
            ],
        },
    })
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["planning_summary"]["scheduled_count"] == 2

    # Step 3: Request C arrives at 9:00 PM
    r3 = test_client.post("/api/v1/brain/analyze", json={
        "request_id": "REQ-3",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T18:00:00",
        "planning_state": {
            "planning_mode": "REPLAN",
            "pending_requests": [
                {
                    "request_id": "REQ-1",
                    "from_station": "KE",
                    "to_station": "ATG",
                    "duration_minutes": 60,
                    "earliest_start": "1900-01-01T10:00:00",
                    "latest_end": "1900-01-01T18:00:00",
                },
                {
                    "request_id": "REQ-2",
                    "from_station": "KE",
                    "to_station": "ATG",
                    "duration_minutes": 60,
                    "earliest_start": "1900-01-01T10:00:00",
                    "latest_end": "1900-01-01T18:00:00",
                },
            ],
        },
    })
    assert r3.status_code == 200
    d3 = r3.json()
    assert d3["planning_summary"]["scheduled_count"] == 3
    recs3 = {r["request_id"]: r["recommendation"] for r in d3["recommendations"]}
    # Verify no two windows overlap
    w1, w2, w3 = recs3["REQ-1"], recs3["REQ-2"], recs3["REQ-3"]
    assert not _intervals_overlap(w1["start"], w1["end"], w2["start"], w2["end"])
    assert not _intervals_overlap(w1["start"], w1["end"], w3["start"], w3["end"])
    assert not _intervals_overlap(w2["start"], w2["end"], w3["start"], w3["end"])


# ── Scenario 6: Deduplication of triggering request in pending_requests ────────

def test_deduplicate_triggering_request(test_client):
    body = {
        "request_id": "REQ-DUP",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T20:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-DUP",  # identical ID
                    "from_station": "KE",
                    "to_station": "ATG",
                    "duration_minutes": 120,
                    "earliest_start": "1900-01-01T10:00:00",
                    "latest_end": "1900-01-01T20:00:00",
                }
            ],
            "fixed_plans": [],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert len(data["recommendations"]) == 1
    assert data["recommendations"][0]["request_id"] == "REQ-DUP"


# ── Scenario 7: Partial planning with unfeasible request ──────────────────────

def test_partial_plan_unfeasible_request(test_client):
    # REQ-BLOCKED has only 10:00 to 12:00, but a fixed plan occupies that exact time
    body = {
        "request_id": "REQ-OK",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T14:00:00",
        "latest_end": "1900-01-01T18:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-BLOCKED",
                    "from_station": "KE",
                    "to_station": "ATG",
                    "duration_minutes": 120,
                    "earliest_start": "1900-01-01T10:00:00",
                    "latest_end": "1900-01-01T12:00:00",
                }
            ],
            "fixed_plans": [
                {
                    "request_id": "REQ-BLOCKING-FIXED",
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
    recs = {rec["request_id"]: rec for rec in data["recommendations"]}
    assert recs["REQ-OK"]["status"] == "RECOMMENDED"
    assert recs["REQ-BLOCKED"]["status"] == "NO_FEASIBLE_WINDOW"
    assert data["planning_summary"]["scheduled_count"] == 1
    assert data["planning_summary"]["unfeasible_count"] == 1


# ── Scenario 8: Post-planning bundling opportunity analysis ───────────────────

def test_bundling_opportunity_analysis(test_client):
    body = {
        "request_id": "REQ-B1",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T18:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-B2",
                    "from_station": "KE",
                    "to_station": "ATG",
                    "duration_minutes": 60,
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
    assert "bundles" in data
    assert len(data["bundles"]) >= 1
    bundle = data["bundles"][0]
    assert bundle["recommendation"] in ["BUNDLE", "SEPARATE"]
    assert "REQ-B1" in bundle["request_ids"]
    assert "REQ-B2" in bundle["request_ids"]
    assert bundle["combined_duration_minutes"] == 120


# ── Scenario 9: Different sections planned independently ──────────────────────

def test_different_sections_independent_planning(test_client):
    # Two requests on different sections can overlap in time if optimal
    body = {
        "request_id": "REQ-SEC1",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T14:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-SEC2",
                    "from_station": "PNVL",
                    "to_station": "KJT",
                    "duration_minutes": 120,
                    "earliest_start": "1900-01-01T10:00:00",
                    "latest_end": "1900-01-01T14:00:00",
                }
            ],
            "fixed_plans": [],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["planning_summary"]["scheduled_count"] == 2
    recs = {rec["request_id"]: rec for rec in data["recommendations"]}
    assert recs["REQ-SEC1"]["status"] == "RECOMMENDED"
    assert recs["REQ-SEC2"]["status"] == "RECOMMENDED"


# ── Scenario 10: Backend-owned version preservation ───────────────────────────

def test_backend_owned_version_and_mode(test_client):
    body = {
        "request_id": "REQ-V7",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T14:00:00",
        "planning_state": {
            "version": 7,
            "planning_mode": "REPLAN",
            "pending_requests": [],
            "fixed_plans": [],
        },
    }
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["plan_version"] == 7
    assert data["metadata"]["plan_version"] == 7
    assert data["planning_summary"]["planning_mode"] == "REPLAN"
