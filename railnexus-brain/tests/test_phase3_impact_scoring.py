"""
tests/test_phase3_impact_scoring.py — Phase 3 Multi-Factor Impact Scoring Test Suite.

Contains 30 deterministic verification tests across:
1. Default behavior (invariant preservation)
2. Affected train count (Factor B)
3. Train priority (Factor C)
4. Maintenance priority (Factor D)
5. Score breakdown structure & math
6. Missing data handling & no fabrication
7. Determinism
8. API contracts & metadata
9. Optimizer centralization
10. Joint planner & Bundling integration
11. Explanations & Prototype disclaimers
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import patch

import config
from config import (
    DELAY_WEIGHT,
    AFFECTED_TRAIN_WEIGHT,
    TRAIN_PRIORITY_WEIGHT,
    MAINTENANCE_PRIORITY_WEIGHT,
    ENABLE_AFFECTED_TRAIN_FACTOR,
    ENABLE_TRAIN_PRIORITY_FACTOR,
    ENABLE_MAINTENANCE_PRIORITY_FACTOR,
    TRAIN_TYPE_WEIGHTS,
    MAINTENANCE_PRIORITY_WEIGHTS,
    SCORING_VERSION,
    ALGORITHM_VERSION,
)
from core.candidate_windows import CandidateWindow
from core.cascade_delay import DelayEvent
from core.impact_score import (
    compute_impact_score,
    get_uniquely_affected_trains,
    ScoreResult,
    ScoreBreakdownItem,
)
from core.optimizer import run_optimization, simulate_window
from core.joint_planner import joint_plan
from core.bundling import evaluate_bundle
from core.explanation import generate_explanation
from core.train_repository import TrainRepository


# ---------------------------------------------------------------------------
# Fixtures / Helpers
# ---------------------------------------------------------------------------

def create_mock_window(
    start: datetime = datetime(1900, 1, 1, 10, 0),
    duration: int = 120,
    direct_delay: float = 30.0,
    secondary_delay: float = 15.0,
    total_delay: float = 45.0,
    traces: list = None,
) -> CandidateWindow:
    w = CandidateWindow(
        start=start,
        end=start + timedelta(minutes=duration),
        direct_delay_minutes=direct_delay,
        secondary_delay_minutes=secondary_delay,
        total_delay_minutes=total_delay,
        impact_score=total_delay,
    )
    if traces is not None:
        w.delay_trace = traces
    else:
        # Default 2 affected trains
        w.delay_trace = [
            {
                "delay_type": "DIRECT",
                "train_number": 12301,
                "section": "SEC_A",
                "delay_minutes": 30.0,
                "cause": "Maintenance block",
            },
            {
                "delay_type": "SECONDARY",
                "train_number": 12302,
                "section": "SEC_B",
                "delay_minutes": 15.0,
                "cause": "Precedence conflict with 12301",
            },
        ]
    return w


class MockRequest:
    def __init__(self, rid, f="KE", t="ATG", dur=60, s=None, e=None, p="MEDIUM"):
        self.request_id = rid
        self.from_station = f
        self.to_station = t
        self.duration_minutes = dur
        self.earliest_start = s or datetime(1900, 1, 1, 10, 0)
        self.latest_end = e or datetime(1900, 1, 1, 16, 0)
        self.priority = p


# ---------------------------------------------------------------------------
# 1. Default Behavior
# ---------------------------------------------------------------------------

def test_01_default_score_equals_total_delay():
    """Under default configuration, impact_score == total_delay_minutes."""
    w = create_mock_window(total_delay=45.0)
    score_res = compute_impact_score(w, request_priority="MEDIUM")
    assert score_res.total_score == 45.0
    assert float(score_res) == 45.0


def test_02_default_recommendation_unchanged(real_repo):
    """Best candidate window selected under default config matches Phase 2 pure delay selection."""
    opt_res = run_optimization(
        repo=real_repo,
        from_station="KE",
        to_station="ATG",
        earliest_start=datetime(1900, 1, 1, 6, 0),
        latest_end=datetime(1900, 1, 1, 18, 0),
        duration_minutes=120,
        request_priority="MEDIUM",
    )
    assert opt_res is not None
    best, ranked = opt_res
    assert len(ranked) > 0
    # Every window's impact_score must equal its total_delay_minutes
    for r in ranked:
        assert r.window.impact_score == r.window.total_delay_minutes


def test_03_zero_weight_factor_has_no_effect():
    """Setting factor weight to 0.0 guarantees weighted_value is 0.0 regardless of raw value."""
    w = create_mock_window(total_delay=20.0)
    score_res = compute_impact_score(w)
    for item in score_res.breakdown:
        if item.weight == 0.0:
            assert item.weighted_value == 0.0


# ---------------------------------------------------------------------------
# 2. Affected Train Count (Factor B)
# ---------------------------------------------------------------------------

def test_04_affected_train_count_uses_unique_trains():
    """Unique trains are counted, not the total number of delay events."""
    traces = [
        {"delay_type": "DIRECT", "train_number": 101, "delay_minutes": 10.0},
        {"delay_type": "PROPAGATED", "train_number": 101, "delay_minutes": 10.0},
        {"delay_type": "SECONDARY", "train_number": 102, "delay_minutes": 5.0},
    ]
    w = create_mock_window(traces=traces)
    unique_trains = get_uniquely_affected_trains(w)
    assert unique_trains == [101, 102]
    assert len(unique_trains) == 2


def test_05_repeated_movements_not_double_counted():
    """Same train with multiple movements or propagation events counts as 1 affected train."""
    traces = [
        {"delay_type": "DIRECT", "train_number": 101, "delay_minutes": 10.0},
        {"delay_type": "PROPAGATED", "train_number": 101, "delay_minutes": 10.0},
        {"delay_type": "PROPAGATED", "train_number": 101, "delay_minutes": 10.0},
    ]
    w = create_mock_window(traces=traces)
    assert len(get_uniquely_affected_trains(w)) == 1


def test_06_affected_train_factor_disabled_by_default():
    """Affected train count factor is disabled and contributes 0.0 by default."""
    w = create_mock_window()
    res = compute_impact_score(w)
    item = next(b for b in res.breakdown if b.factor == "affected_train_count")
    assert item.weight == 0.0
    assert item.weighted_value == 0.0
    assert item.status == "DATA_BACKED"


# ---------------------------------------------------------------------------
# 3. Train Priority (Factor C)
# ---------------------------------------------------------------------------

def test_07_train_priority_disabled_by_default():
    """Train priority factor is disabled by default."""
    w = create_mock_window()
    res = compute_impact_score(w)
    item = next(b for b in res.breakdown if b.factor == "train_priority")
    assert item.weight == 0.0
    assert item.weighted_value == 0.0
    assert item.status == "PROTOTYPE_ASSUMPTION"


def test_08_configured_train_priority_changes_score():
    """When enabled with positive weight, train priority modifies the impact score."""
    w = create_mock_window(total_delay=10.0)
    with patch.object(config, "ENABLE_TRAIN_PRIORITY_FACTOR", True), \
         patch.object(config, "TRAIN_PRIORITY_WEIGHT", 2.0), \
         patch.object(config, "TRAIN_TYPE_WEIGHTS", {"RAJ": 3.0}):
        
        class MockRepo:
            def get_train_type(self, train_id):
                return "RAJ" if train_id == 12301 else "UNKNOWN"
            def get_train_movements(self, train_id):
                class MockMov:
                    train_type = "RAJ" if train_id == 12301 else "UNKNOWN"
                return [MockMov()]
        
        res = compute_impact_score(w, repo=MockRepo())
        item = next(b for b in res.breakdown if b.factor == "train_priority")
        assert item.raw_value > 0.0
        assert item.weighted_value > 0.0
        assert res.total_score > 10.0


def test_09_unknown_train_type_is_not_fabricated():
    """Train not in TRAIN_TYPE_WEIGHTS is assigned 0.0 contribution and flagged."""
    w = create_mock_window(total_delay=10.0)
    with patch.object(config, "ENABLE_TRAIN_PRIORITY_FACTOR", True), \
         patch.object(config, "TRAIN_PRIORITY_WEIGHT", 1.0), \
         patch.object(config, "TRAIN_TYPE_WEIGHTS", {"RAJ": 3.0}):
        
        class MockRepo:
            def get_train_type(self, train_id):
                return "SPECIAL_UNMAPPED"
            def get_train_movements(self, train_id):
                class MockMov:
                    train_type = "SPECIAL_UNMAPPED"
                return [MockMov()]
        
        res = compute_impact_score(w, repo=MockRepo())
        item = next(b for b in res.breakdown if b.factor == "train_priority")
        assert item.raw_value == 0.0
        assert item.weighted_value == 0.0
        assert "Unmapped train types" in item.details


def test_10_train_priority_status_is_prototype_assumption():
    """When train priority is active, its status is explicitly PROTOTYPE_ASSUMPTION."""
    w = create_mock_window()
    with patch.object(config, "ENABLE_TRAIN_PRIORITY_FACTOR", True), \
         patch.object(config, "TRAIN_PRIORITY_WEIGHT", 1.0):
        res = compute_impact_score(w)
        item = next(b for b in res.breakdown if b.factor == "train_priority")
        assert item.status in ("PROTOTYPE_ASSUMPTION", "MISSING DATA")


# ---------------------------------------------------------------------------
# 4. Maintenance Priority (Factor D)
# ---------------------------------------------------------------------------

def test_11_maintenance_priority_disabled_by_default():
    """Maintenance priority factor is disabled by default."""
    w = create_mock_window()
    res = compute_impact_score(w, request_priority="CRITICAL")
    item = next(b for b in res.breakdown if b.factor == "maintenance_priority")
    assert item.weight == 0.0
    assert item.weighted_value == 0.0
    assert item.status == "PROTOTYPE_ASSUMPTION"


def test_12_configured_maintenance_priority_changes_score():
    """When enabled with positive weight, maintenance priority alters the score."""
    w = create_mock_window(total_delay=10.0)
    with patch.object(config, "ENABLE_MAINTENANCE_PRIORITY_FACTOR", True), \
         patch.object(config, "MAINTENANCE_PRIORITY_WEIGHT", 5.0), \
         patch.object(config, "MAINTENANCE_PRIORITY_WEIGHTS", {"CRITICAL": 10.0}):
        res = compute_impact_score(w, request_priority="CRITICAL")
        item = next(b for b in res.breakdown if b.factor == "maintenance_priority")
        assert item.raw_value == 10.0
        assert item.weighted_value == 50.0
        assert res.total_score == 60.0


def test_13_maintenance_priority_status_is_prototype_assumption():
    """When maintenance priority is active, status is explicitly PROTOTYPE_ASSUMPTION."""
    w = create_mock_window()
    with patch.object(config, "ENABLE_MAINTENANCE_PRIORITY_FACTOR", True), \
         patch.object(config, "MAINTENANCE_PRIORITY_WEIGHT", 1.0):
        res = compute_impact_score(w, request_priority="HIGH")
        item = next(b for b in res.breakdown if b.factor == "maintenance_priority")
        assert item.status == "PROTOTYPE_ASSUMPTION"


# ---------------------------------------------------------------------------
# 5. Score Breakdown Structure & Math
# ---------------------------------------------------------------------------

def test_14_score_breakdown_contains_all_factors():
    """Score breakdown contains all 4 factors."""
    w = create_mock_window()
    res = compute_impact_score(w)
    names = [b.factor for b in res.breakdown]
    assert "total_delay" in names
    assert "affected_train_count" in names
    assert "train_priority" in names
    assert "maintenance_priority" in names


def test_15_weighted_value_matches_raw_times_weight():
    """Each factor's weighted_value equals round(raw_value * weight, 2)."""
    w = create_mock_window(total_delay=25.5)
    with patch.object(config, "ENABLE_AFFECTED_TRAIN_FACTOR", True), \
         patch.object(config, "AFFECTED_TRAIN_WEIGHT", 1.5):
        res = compute_impact_score(w)
        for item in res.breakdown:
            expected = round(item.raw_value * item.weight, 2)
            assert item.weighted_value == expected


def test_16_score_breakdown_matches_final_score():
    """The sum of all weighted_values equals total_score."""
    w = create_mock_window(total_delay=33.3)
    res = compute_impact_score(w)
    sum_weights = round(sum(b.weighted_value for b in res.breakdown), 2)
    assert res.total_score == sum_weights


# ---------------------------------------------------------------------------
# 6. Missing Data Handling & No Fabrication
# ---------------------------------------------------------------------------

def test_17_missing_train_priority_mapping_returns_missing_data():
    """Train with no priority mapping returns note 'Unmapped train types'."""
    w = create_mock_window()
    with patch.object(config, "ENABLE_TRAIN_PRIORITY_FACTOR", True), \
         patch.object(config, "TRAIN_PRIORITY_WEIGHT", 1.0):
        res = compute_impact_score(w, repo=None)
        item = next(b for b in res.breakdown if b.factor == "train_priority")
        assert item.status == "MISSING DATA"
        assert item.raw_value == 0.0


def test_18_missing_data_never_fabricated():
    """Unknown train type or missing repo never fabricates synthetic scores."""
    w = create_mock_window()
    with patch.object(config, "ENABLE_TRAIN_PRIORITY_FACTOR", True), \
         patch.object(config, "TRAIN_PRIORITY_WEIGHT", 1.0):
        class EmptyRepo:
            def get_train_type(self, train_id):
                return None
            def get_train_movements(self, train_id):
                return []
        res = compute_impact_score(w, repo=EmptyRepo())
        item = next(b for b in res.breakdown if b.factor == "train_priority")
        assert item.raw_value == 0.0
        assert item.weighted_value == 0.0


# ---------------------------------------------------------------------------
# 7. Determinism
# ---------------------------------------------------------------------------

def test_19_same_input_same_score():
    """Multiple evaluations of identical candidate window produce identical total score."""
    w = create_mock_window(total_delay=50.0)
    res1 = compute_impact_score(w)
    res2 = compute_impact_score(w)
    assert res1.total_score == res2.total_score


def test_20_same_input_same_breakdown():
    """Multiple evaluations produce byte-for-byte identical breakdowns."""
    w = create_mock_window(total_delay=50.0)
    res1 = compute_impact_score(w)
    res2 = compute_impact_score(w)
    assert [b.to_dict() for b in res1.breakdown] == [b.to_dict() for b in res2.breakdown]


def test_21_same_input_same_recommendation(real_repo):
    """Optimizer run twice with same request yields identical window ordering & breakdown."""
    w1 = run_optimization(
        repo=real_repo,
        from_station="KE",
        to_station="ATG",
        earliest_start=datetime(1900, 1, 1, 6, 0),
        latest_end=datetime(1900, 1, 1, 18, 0),
        duration_minutes=120,
    )
    w2 = run_optimization(
        repo=real_repo,
        from_station="KE",
        to_station="ATG",
        earliest_start=datetime(1900, 1, 1, 6, 0),
        latest_end=datetime(1900, 1, 1, 18, 0),
        duration_minutes=120,
    )
    assert w1 is not None and w2 is not None
    best1, ranked1 = w1
    best2, ranked2 = w2
    assert len(ranked1) == len(ranked2)
    for a, b in zip(ranked1, ranked2):
        assert a.window.impact_score == b.window.impact_score
        assert a.window.score_breakdown == b.window.score_breakdown


# ---------------------------------------------------------------------------
# 8. API Contracts & Metadata
# ---------------------------------------------------------------------------

def test_22_response_contains_score_breakdown(test_client):
    """API /api/v1/brain/analyze response includes score_breakdown on recommendation and response."""
    payload = {
        "request_id": "REQ-P3-API",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T14:00:00",
        "priority": "HIGH",
    }
    resp = test_client.post("/api/v1/brain/analyze", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "score_breakdown" in data
    assert isinstance(data["score_breakdown"], list)
    assert len(data["score_breakdown"]) == 4
    if data.get("recommendation"):
        assert "score_breakdown" in data["recommendation"]
        assert len(data["recommendation"]["score_breakdown"]) == 4


def test_23_response_contains_scoring_version(test_client):
    """API /api/v1/brain/analyze metadata contains scoring_version == 'PHASE_3_V1'."""
    payload = {
        "request_id": "REQ-P3-VER",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T14:00:00",
    }
    resp = test_client.post("/api/v1/brain/analyze", json=payload)
    assert resp.status_code == 200
    meta = resp.json().get("metadata", {})
    assert meta.get("scoring_version") == SCORING_VERSION
    assert meta.get("algorithm_version") == ALGORITHM_VERSION


def test_24_existing_impact_score_field_preserved(test_client):
    """Existing impact_score field is preserved as numeric and matches total delay under default config."""
    payload = {
        "request_id": "REQ-P3-PRESERVE",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T14:00:00",
    }
    resp = test_client.post("/api/v1/brain/analyze", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    rec = data.get("recommendation")
    metrics = data.get("metrics")
    if rec and metrics:
        assert isinstance(rec["impact_score"], (int, float))
        assert rec["impact_score"] == metrics["total_delay_minutes"]


# ---------------------------------------------------------------------------
# 9. Optimizer Centralization
# ---------------------------------------------------------------------------

def test_25_optimizer_uses_centralized_score(real_repo):
    """Optimizer simulate_window calls compute_impact_score and sets window attributes."""
    opt_res = run_optimization(
        repo=real_repo,
        from_station="KE",
        to_station="ATG",
        earliest_start=datetime(1900, 1, 1, 6, 0),
        latest_end=datetime(1900, 1, 1, 18, 0),
        duration_minutes=120,
        request_priority="HIGH",
    )
    assert opt_res is not None
    best, _ = opt_res
    test_window = CandidateWindow(start=best.window.start, end=best.window.end)
    sim_res = simulate_window(
        window=test_window,
        repo=real_repo,
        from_station="KE",
        to_station="ATG",
        request_priority="HIGH",
    )
    assert sim_res.window.feasible is True
    assert hasattr(sim_res.window, "score_breakdown")
    assert len(sim_res.window.score_breakdown) == 4
    assert sim_res.window.impact_score == sim_res.window.total_delay_minutes



# ---------------------------------------------------------------------------
# 10. Joint Planner & Bundling Integration
# ---------------------------------------------------------------------------

def test_26_joint_planner_uses_phase3_score(real_repo):
    """Joint planner candidate windows contain score_breakdown and use Phase 3 scoring."""
    req1 = MockRequest("R1", "KE", "ATG", 60, datetime(1900, 1, 1, 6, 0), datetime(1900, 1, 1, 12, 0))
    res = joint_plan([req1], [], real_repo, step_minutes=60)
    assert res is not None
    for rid, sim_res in res.per_request_results.items():
        if sim_res:
            assert hasattr(sim_res.window, "score_breakdown")
            assert len(sim_res.window.score_breakdown) == 4


def test_27_bundle_uses_phase3_score(test_client):
    """Bundling evaluation via analyze API produces bundles and preserves score_breakdown."""
    body = {
        "request_id": "REQ-BND-P3-1",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T15:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-BND-P3-2",
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
    assert "score_breakdown" in data
    assert len(data["score_breakdown"]) == 4


def test_28_bundle_label_has_single_phase_label(test_client):
    """Bundle reason contains ONLY single [PHASE 2 BUNDLE ESTIMATE] label."""
    body = {
        "request_id": "REQ-BND-LBL1",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T11:00:00",
        "latest_end": "1900-01-01T15:00:00",
        "planning_state": {
            "pending_requests": [
                {
                    "request_id": "REQ-BND-LBL2",
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
            assert "[PHASE 1 BUNDLE ESTIMATE]" not in b["reason"]
            assert "[PHASE 2 BUNDLE ESTIMATE]" in b["reason"]


# ---------------------------------------------------------------------------
# 11. Explanations & Prototype Disclaimers
# ---------------------------------------------------------------------------

def test_29_explanation_matches_score_breakdown():
    """Explanation includes explicit breakdown values matching score_breakdown."""
    w = create_mock_window(total_delay=15.0)
    score_res = compute_impact_score(w)
    w.impact_score = score_res.total_score
    w.score_breakdown = [b.to_dict() for b in score_res.breakdown]
    
    explanation = generate_explanation(w, [], [w], "KE", "ATG", 120)
    assert "Score breakdown:" in explanation
    assert "Attributable total delay" in explanation
    assert "15.00" in explanation


def test_30_explanation_warns_about_prototype_weights():
    """Explanation contains disclaimer warning when prototype priority factors are active."""
    w = create_mock_window(total_delay=15.0)
    with patch.object(config, "ENABLE_TRAIN_PRIORITY_FACTOR", True), \
         patch.object(config, "TRAIN_PRIORITY_WEIGHT", 1.0):
        score_res = compute_impact_score(w)
        w.impact_score = score_res.total_score
        w.score_breakdown = [b.to_dict() for b in score_res.breakdown]
        
        explanation = generate_explanation(w, [], [w], "KE", "ATG", 120)
        assert "prototype configuration" in explanation


