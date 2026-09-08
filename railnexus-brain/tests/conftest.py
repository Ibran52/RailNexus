"""
conftest.py — shared pytest fixtures for RailNexus Brain tests.
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import pandas as pd
import pytest

# ── Import paths ──────────────────────────────────────────────────────────────
_SRC  = str(Path(__file__).parent.parent / "src")
_TEST = str(Path(__file__).parent)
for _p in (_SRC, _TEST):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from core.data_loader import load_dataframe  # type: ignore
from core.train_repository import TrainRepository  # type: ignore
from services.brain_service import BrainService  # type: ignore


# ── Date-base helper ──────────────────────────────────────────────────────────

def dt(h: int, m: int = 0) -> datetime:
    """Build a 1900-01-01 datetime (matching dataset convention)."""
    return datetime(1900, 1, 1, h, m)


# ── Minimal in-memory DataFrame builder ──────────────────────────────────────

def make_df(rows: list[dict]) -> pd.DataFrame:
    """Build a minimal DataFrame matching the schema expected by core modules."""
    df = pd.DataFrame(rows)
    df["train_number"]            = pd.to_numeric(df["train_number"], errors="coerce")
    df["occupancy_duration_mins"] = pd.to_numeric(df["occupancy_duration_mins"], errors="coerce")
    df["block_section_km"]        = pd.to_numeric(
        df["block_section_km"] if "block_section_km" in df.columns
        else [0.0] * len(df), errors="coerce"
    )
    df["day"] = pd.to_numeric(
        df["day"] if "day" in df.columns else [1.0] * len(df), errors="coerce"
    )
    df["train_type"]   = df["train_type"].astype(str)
    df["from_station"] = df["from_station"].astype(str)
    df["to_station"]   = df["to_station"].astype(str)
    df["from_dt"]      = pd.to_datetime(df["from_dt"])
    df["to_dt"]        = pd.to_datetime(df["to_dt"])
    # Stub columns required by config.REQUIRED_CSV_COLUMNS
    for col in ("from_time", "to_time"):
        if col not in df.columns:
            df[col] = ""
    return df


# ── Session-scoped fixtures ───────────────────────────────────────────────────

@pytest.fixture(scope="session")
def real_csv_path() -> Path:
    return Path(__file__).parent.parent / "data" / "movement" / "train_movement.csv"


@pytest.fixture(scope="session")
def real_df(real_csv_path):
    if not real_csv_path.exists():
        pytest.skip("Real CSV not present.")
    return load_dataframe(real_csv_path)


@pytest.fixture(scope="session")
def real_repo(real_df):
    return TrainRepository(real_df)


@pytest.fixture(scope="session")
def real_service(real_repo):
    return BrainService(real_repo)


@pytest.fixture(scope="session")
def test_client(real_df, real_repo, real_service):
    """
    Full TestClient wired to the real dataset, bypassing the lifespan
    by directly injecting pre-built singletons into app.state.
    """
    from fastapi.testclient import TestClient
    # pyrefly: ignore [missing-import]
    from main import create_app

    app = create_app(skip_lifespan=True)

    # Inject pre-built singletons so routes work without loading CSV
    app.state.df            = real_df
    app.state.repo          = real_repo
    app.state.brain_service = real_service

    with TestClient(app, raise_server_exceptions=False) as client:
        yield client
