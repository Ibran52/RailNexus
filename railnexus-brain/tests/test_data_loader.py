"""
test_data_loader.py — tests for core/data_loader.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from config import REQUIRED_CSV_COLUMNS  # type: ignore
from core.data_loader import load_dataframe  # type: ignore


def test_load_real_csv_shape(real_csv_path):
    df = load_dataframe(real_csv_path)
    assert df.shape[0] > 0
    assert df.shape[1] >= len(REQUIRED_CSV_COLUMNS)


def test_required_columns_present(real_csv_path):
    df = load_dataframe(real_csv_path)
    for col in REQUIRED_CSV_COLUMNS:
        assert col in df.columns, f"Required column '{col}' missing."


def test_from_dt_parsed(real_csv_path):
    import pandas as pd
    df = load_dataframe(real_csv_path)
    assert pd.api.types.is_datetime64_any_dtype(df["from_dt"])


def test_to_dt_parsed(real_csv_path):
    import pandas as pd
    df = load_dataframe(real_csv_path)
    assert pd.api.types.is_datetime64_any_dtype(df["to_dt"])


def test_missing_column_raises(tmp_path):
    bad_csv = tmp_path / "bad.csv"
    # Missing 'to_dt'
    bad_csv.write_text(
        "train_number,train_type,from_station,to_station,"
        "from_time,to_time,day,block_section_km,from_dt,occupancy_duration_mins\n"
        "1,Exp,A,B,10:00:00,10:30:00,1,1.0,1900-01-01 10:00:00,30\n"
    )
    with pytest.raises(ValueError, match="to_dt"):
        load_dataframe(bad_csv)


def test_nonexistent_csv_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_dataframe(tmp_path / "does_not_exist.csv")


def test_raw_csv_not_modified(real_csv_path, real_df):
    """Loading again should give the same row count as the fixture — no side effects."""
    df2 = load_dataframe(real_csv_path)
    assert len(df2) == len(real_df)
