"""
config.py — RailNexus Brain
Global configuration constants and environment-aware settings.
"""

from __future__ import annotations

from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT_DIR: Path = Path(__file__).parent.parent          # railnexus-brain/
DATA_DIR: Path = ROOT_DIR / "data" / "raw"
CSV_FILENAME: str = "block_ready_mumbai_pune.csv"
CSV_PATH: Path = DATA_DIR / CSV_FILENAME

# ── Service metadata ──────────────────────────────────────────────────────────
SERVICE_NAME: str = "railnexus-brain"
SERVICE_VERSION: str = "1.0.0"
API_PREFIX: str = "/api/v1/brain"

DATASET_VERSION: str = "v1"
ALGORITHM_VERSION: str = "PHASE_3_IMPACT_SCORING"


# ── Candidate window defaults ─────────────────────────────────────────────────
DEFAULT_WINDOW_STEP_MINUTES: int = 60   # sliding step between candidates

# ── Joint Planning defaults ───────────────────────────────────────────────────
JOINT_PLANNING_CAP: int = 5         # max pending requests for full Cartesian joint optimization
MAX_CANDIDATES_JOINT: int = 8       # max candidate windows per request in joint mode for tractability

# ── Date base used in dataset (times stored under 1900-01-01) ─────────────────
DATASET_DATE_BASE: str = "1900-01-01"

# ── Validation tolerance ──────────────────────────────────────────────────────
DURATION_TOLERANCE_MINS: float = 1.0   # acceptable mismatch between stored & calculated

# ── Not-implemented sentinel ──────────────────────────────────────────────────
NOT_IMPLEMENTED: str = "NOT_IMPLEMENTED"

# ── Cascade Delay Engine defaults (Phase 2) ──────────────────────────────────
CASCADE_ENABLED: bool = True
MAX_CASCADE_DEPTH: int = 20
CASCADE_SIMULATION_VERSION: str = "PHASE_2_DETERMINISTIC"

# ── Multi-Factor Impact Scoring defaults (Phase 3) ─────────────────────────────
DELAY_WEIGHT: float = 1.0
AFFECTED_TRAIN_WEIGHT: float = 0.0
TRAIN_PRIORITY_WEIGHT: float = 0.0
MAINTENANCE_PRIORITY_WEIGHT: float = 0.0

ENABLE_AFFECTED_TRAIN_FACTOR: bool = False
ENABLE_TRAIN_PRIORITY_FACTOR: bool = False
ENABLE_MAINTENANCE_PRIORITY_FACTOR: bool = False

TRAIN_TYPE_WEIGHTS: dict[str, float] = {
    "SF": 0.0,
    "Exp": 0.0,
    "Mail": 0.0,
    "Pass": 0.0,
    "Local-M": 0.0,
    "Local-P": 0.0,
}

MAINTENANCE_PRIORITY_WEIGHTS: dict[str, float] = {
    "LOW": 0.0,
    "MEDIUM": 0.0,
    "HIGH": 0.0,
    "CRITICAL": 0.0,
}

SCORING_VERSION: str = "PHASE_3_V1"


# ── Required columns in the CSV ───────────────────────────────────────────────
REQUIRED_CSV_COLUMNS: list[str] = [
    "train_number",
    "train_type",
    "from_station",
    "to_station",
    "from_time",
    "to_time",
    "day",
    "block_section_km",
    "from_dt",
    "to_dt",
    "occupancy_duration_mins",
]
