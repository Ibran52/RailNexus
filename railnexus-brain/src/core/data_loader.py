"""
data_loader.py — RailNexus Brain / core
Loads and parses block_ready_mumbai_pune.csv into a clean DataFrame.

Rules:
  - Raw CSV is NEVER modified on disk.
  - Unparseable values become NaT/NaN — they are never silently invented.
  - Raises immediately if required columns are missing.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

import pandas as pd

from config import CSV_PATH, REQUIRED_CSV_COLUMNS

logger = logging.getLogger(__name__)


# ── public API ────────────────────────────────────────────────────────────────

def load_dataframe(csv_path: Path = CSV_PATH) -> pd.DataFrame:
    """
    Load the CSV and return a parsed, validated-column DataFrame.

    This function is the ONLY place that touches the CSV file.
    It never writes back to disk.

    Parameters
    ----------
    csv_path : Path
        Path to the raw CSV file.

    Returns
    -------
    pd.DataFrame
        Working copy with typed columns. Raw file untouched.

    Raises
    ------
    FileNotFoundError : if csv_path does not exist.
    ValueError        : if a required column is absent.
    """
    csv_path = Path(csv_path)
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    logger.info("Loading dataset from %s", csv_path)

    # Read everything as strings first — no silent coercion.
    df_raw = pd.read_csv(csv_path, dtype=str, low_memory=False)

    # Column check
    missing = [c for c in REQUIRED_CSV_COLUMNS if c not in df_raw.columns]
    if missing:
        raise ValueError(f"Required columns missing from CSV: {missing}")

    # Work on a copy — never mutate df_raw reference
    df = df_raw.copy()

    # Numeric columns
    df["train_number"]            = pd.to_numeric(df["train_number"], errors="coerce")
    df["occupancy_duration_mins"] = pd.to_numeric(df["occupancy_duration_mins"], errors="coerce")
    df["block_section_km"]        = pd.to_numeric(df["block_section_km"], errors="coerce")
    df["day"]                     = pd.to_numeric(df["day"], errors="coerce")

    # Datetime columns  (dataset stores times under 1900-01-01)
    df["from_dt"] = pd.to_datetime(df["from_dt"], format="%Y-%m-%d %H:%M:%S", errors="coerce")
    df["to_dt"]   = pd.to_datetime(df["to_dt"],   format="%Y-%m-%d %H:%M:%S", errors="coerce")

    # Strip whitespace from station / type codes
    for col in ("train_type", "from_station", "to_station"):
        df[col] = df[col].str.strip()

    nat_from = int(df["from_dt"].isna().sum())
    nat_to   = int(df["to_dt"].isna().sum())
    if nat_from or nat_to:
        logger.warning("NaT in from_dt: %d | to_dt: %d — rows excluded from analysis",
                       nat_from, nat_to)

    logger.info("Dataset loaded: %d rows, %d trains, %d unique stations",
                len(df),
                df["train_number"].nunique(),
                pd.concat([df["from_station"], df["to_station"]]).nunique())
    return df


@lru_cache(maxsize=1)
def get_cached_dataframe() -> pd.DataFrame:
    """
    Return a cached copy of the dataset.
    The cache is populated once at startup and reused for the service lifetime.
    Call `get_cached_dataframe.cache_clear()` to force a reload (e.g., in tests).
    """
    return load_dataframe()
