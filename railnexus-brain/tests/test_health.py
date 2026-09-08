"""
test_health.py — health and data-status endpoint tests.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


def test_health_returns_200(test_client):
    r = test_client.get("/api/v1/brain/health")
    assert r.status_code == 200


def test_health_response_shape(test_client):
    data = test_client.get("/api/v1/brain/health").json()
    assert data["status"] == "ok"
    assert data["service"] == "railnexus-brain"
    assert "version" in data


def test_data_status_returns_200(test_client):
    r = test_client.get("/api/v1/brain/data-status")
    assert r.status_code == 200


def test_data_status_fields(test_client):
    data = test_client.get("/api/v1/brain/data-status").json()
    assert data["status"] == "ready"
    assert data["row_count"] > 0
    assert data["train_count"] > 0
    assert data["station_count"] > 0
    assert "validation_errors" in data
    assert "validation_warnings" in data


def test_data_status_dataset_name(test_client):
    data = test_client.get("/api/v1/brain/data-status").json()
    assert "train_movement.csv" in data["dataset"]
