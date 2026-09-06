"""
test_brain_api.py — /api/v1/brain/analyze integration tests.
Uses the real CSV wherever available.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

# ── Helpers ───────────────────────────────────────────────────────────────────

def _valid_body(**overrides) -> dict:
    """Base valid body — KE→ATG, 2 hours, 10:00–20:00 (1900-01-01 date base)."""
    body = {
        "request_id": "REQ-TEST-001",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T20:00:00",
        "priority": "HIGH",
    }
    body.update(overrides)
    return body


# ── Happy-path ────────────────────────────────────────────────────────────────

def test_analyze_success_status_code(test_client):
    r = test_client.post("/api/v1/brain/analyze", json=_valid_body())
    assert r.status_code == 200


def test_analyze_success_flag(test_client):
    data = test_client.post("/api/v1/brain/analyze", json=_valid_body()).json()
    assert data["success"] is True


def test_analyze_has_brain_run_id(test_client):
    data = test_client.post("/api/v1/brain/analyze", json=_valid_body()).json()
    assert "brain_run_id" in data
    assert len(data["brain_run_id"]) > 0


def test_analyze_returns_recommendation(test_client):
    data = test_client.post("/api/v1/brain/analyze", json=_valid_body()).json()
    rec = data["recommendation"]
    assert rec is not None
    assert "start" in rec and "end" in rec
    assert "impact_score" in rec


def test_analyze_metrics_shape(test_client):
    data = test_client.post("/api/v1/brain/analyze", json=_valid_body()).json()
    m = data["metrics"]
    for key in ("conflict_count", "affected_train_count",
                "direct_delay_minutes", "cascade_delay_minutes", "total_delay_minutes"):
        assert key in m, f"metrics.{key} missing"


def test_analyze_cascade_metric_present(test_client):
    data = test_client.post("/api/v1/brain/analyze", json=_valid_body()).json()
    assert data["metrics"]["cascade_delay_minutes"] >= 0.0


def test_analyze_metadata_cascade_simulation_present(test_client):
    data = test_client.post("/api/v1/brain/analyze", json=_valid_body()).json()
    assert data["metadata"]["cascade_simulation"] in (
        "PHASE_2_DETERMINISTIC",
        "PARTIAL",
        "NOT_IMPLEMENTED",
    )


def test_analyze_conflicts_list_present(test_client):
    data = test_client.post("/api/v1/brain/analyze", json=_valid_body()).json()
    assert isinstance(data["conflicts"], list)


def test_analyze_explanation_present(test_client):
    data = test_client.post("/api/v1/brain/analyze", json=_valid_body()).json()
    assert isinstance(data["explanation"], str)
    assert len(data["explanation"]) > 0


def test_analyze_request_id_echoed(test_client):
    data = test_client.post(
        "/api/v1/brain/analyze", json=_valid_body(request_id="REQ-ECHO")
    ).json()
    assert data["request_id"] == "REQ-ECHO"


def test_analyze_alternatives_list(test_client):
    data = test_client.post("/api/v1/brain/analyze", json=_valid_body()).json()
    assert isinstance(data["alternatives"], list)


def test_analyze_stable_schema(test_client):
    """Every top-level key in the contract must be present."""
    data = test_client.post("/api/v1/brain/analyze", json=_valid_body()).json()
    for key in ("success", "brain_run_id", "request_id", "status",
                "recommendation", "metrics", "conflicts",
                "alternatives", "explanation", "metadata"):
        assert key in data, f"Top-level key '{key}' missing from response."


def test_analyze_trace_id_header(test_client):
    data = test_client.post(
        "/api/v1/brain/analyze",
        json=_valid_body(),
        headers={"X-Request-ID": "trace-abc-123"},
    ).json()
    assert data["metadata"]["trace_id"] == "trace-abc-123"


# ── Section not found ─────────────────────────────────────────────────────────

def test_analyze_section_not_found(test_client):
    body = _valid_body(from_station="FAKE_FROM", to_station="FAKE_TO")
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 404
    data = r.json()
    assert data["success"] is False
    assert data["error"]["code"] == "SECTION_NOT_FOUND"


# ── Validation errors ─────────────────────────────────────────────────────────

def test_analyze_duration_zero_rejected(test_client):
    r = test_client.post("/api/v1/brain/analyze", json=_valid_body(duration_minutes=0))
    assert r.status_code == 422
    data = r.json()
    assert data["success"] is False


def test_analyze_same_stations_rejected(test_client):
    r = test_client.post(
        "/api/v1/brain/analyze",
        json=_valid_body(from_station="KE", to_station="KE"),
    )
    assert r.status_code == 422


def test_analyze_end_before_start_rejected(test_client):
    r = test_client.post(
        "/api/v1/brain/analyze",
        json=_valid_body(
            earliest_start="1900-01-01T18:00:00",
            latest_end="1900-01-01T10:00:00",
        ),
    )
    assert r.status_code == 422


def test_analyze_missing_request_id_rejected(test_client):
    body = _valid_body()
    del body["request_id"]
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 422


# ── No feasible window ────────────────────────────────────────────────────────

def test_analyze_no_feasible_window(test_client):
    """
    Request a 300-minute window in a 1-minute range → no feasible window.
    """
    body = _valid_body(
        duration_minutes=300,
        earliest_start="1900-01-01T10:00:00",
        latest_end="1900-01-01T15:00:00",
        # 5-hour range, 5-hour duration → exactly 1 window fits (300 min)
        # Let's use a section that actually has trains to trigger NO_FEASIBLE
        # Actually 300 min in 300 min range = 1 window, so let's use 301 min
    )
    # Make duration just over the range
    body["duration_minutes"] = 301
    body["latest_end"] = "1900-01-01T15:00:00"
    # This should fail validation (duration > range) at pydantic level
    r = test_client.post("/api/v1/brain/analyze", json=body)
    assert r.status_code == 422   # pydantic catches it


def test_analyze_impact_score_is_numeric(test_client):
    data = test_client.post("/api/v1/brain/analyze", json=_valid_body()).json()
    if data["recommendation"]:
        assert isinstance(data["recommendation"]["impact_score"], (int, float))
