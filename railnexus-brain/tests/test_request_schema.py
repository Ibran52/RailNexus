"""
test_request_schema.py — Pydantic AnalyzeRequest validation tests.
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from api.schemas import AnalyzeRequest
from pydantic import ValidationError


def _dt(h: int, m: int = 0) -> datetime:
    return datetime(1900, 1, 1, h, m)


def _valid() -> dict:
    return {
        "request_id": "REQ-TEST",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 120,
        "earliest_start": _dt(10),
        "latest_end": _dt(20),
        "priority": "HIGH",
    }


# ── Valid cases ───────────────────────────────────────────────────────────────

def test_valid_request():
    req = AnalyzeRequest(**_valid())
    assert req.request_id == "REQ-TEST"
    assert req.from_station == "KE"
    assert req.duration_minutes == 120


def test_priority_defaults_to_medium():
    data = _valid()
    del data["priority"]
    req = AnalyzeRequest(**data)
    assert req.priority == "MEDIUM"


# ── Invalid cases ─────────────────────────────────────────────────────────────

def test_missing_request_id():
    data = _valid(); del data["request_id"]
    with pytest.raises(ValidationError):
        AnalyzeRequest(**data)


def test_duration_zero_rejected():
    data = _valid(); data["duration_minutes"] = 0
    with pytest.raises(ValidationError):
        AnalyzeRequest(**data)


def test_duration_negative_rejected():
    data = _valid(); data["duration_minutes"] = -60
    with pytest.raises(ValidationError):
        AnalyzeRequest(**data)


def test_earliest_start_after_latest_end_rejected():
    data = _valid()
    data["earliest_start"] = _dt(20)
    data["latest_end"]     = _dt(10)
    with pytest.raises(ValidationError):
        AnalyzeRequest(**data)


def test_duration_exceeds_window_rejected():
    data = _valid()
    data["earliest_start"]   = _dt(10)
    data["latest_end"]       = _dt(11)   # 60 min range
    data["duration_minutes"] = 180        # needs 3 hrs
    with pytest.raises(ValidationError):
        AnalyzeRequest(**data)


def test_same_stations_rejected():
    data = _valid(); data["to_station"] = "KE"
    with pytest.raises(ValidationError):
        AnalyzeRequest(**data)


def test_blank_station_rejected():
    data = _valid(); data["from_station"] = "  "
    with pytest.raises(ValidationError):
        AnalyzeRequest(**data)


def test_invalid_priority_rejected():
    data = _valid(); data["priority"] = "ULTRA"
    with pytest.raises(ValidationError):
        AnalyzeRequest(**data)
