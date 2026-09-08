"""
data_loader.py — RailNexus Brain / core
Loads and parses the finalized train_movement.csv into a clean DataFrame.

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

from config import (
    CSV_PATH,
    REQUIRED_CSV_COLUMNS,
    SECTION_MASTER_PATH,
    TRAIN_MASTER_PATH,
)

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

    # The finalized package stores movement facts separately from train and
    # section attributes. Normalize that canonical schema into the columns
    # consumed by the existing analysis engine.
    canonical_columns = {
        "train_number", "day", "from_station", "to_station",
        "entry_time", "exit_time", "occupancy_duration_mins",
        "train_id", "section_id",
    }
    if canonical_columns.issubset(df_raw.columns):
        df = df_raw.copy()

        train_master = pd.read_csv(TRAIN_MASTER_PATH, dtype=str, low_memory=False)
        section_master = pd.read_csv(SECTION_MASTER_PATH, dtype=str, low_memory=False)

        train_types = train_master.set_index("train_number")["train_type"]
        section_lengths = section_master.set_index("section_id")["length_km"]
        df["train_type"] = df["train_number"].map(train_types)
        df["block_section_km"] = df["section_id"].map(section_lengths)
        df["from_time"] = df["entry_time"]
        df["to_time"] = df["exit_time"]
        df["from_dt"] = "1900-01-01 " + df["entry_time"].astype(str).str.strip()
        df["to_dt"] = "1900-01-01 " + df["exit_time"].astype(str).str.strip()
    else:
        missing = [c for c in REQUIRED_CSV_COLUMNS if c not in df_raw.columns]
        if missing:
            raise ValueError(f"Required columns missing from CSV: {missing}")
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

    nat_from = df["from_dt"].isna().sum()
    nat_to   = df["to_dt"].isna().sum()
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
