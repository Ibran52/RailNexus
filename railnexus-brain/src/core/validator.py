"""
validator.py — RailNexus Brain / core
Dataset validation producing a structured report.

Severity levels: INFO | WARNING | ERROR | CRITICAL
Rules: no value invention, no silent drops.
"""

from __future__ import annotations

import dataclasses
from typing import List

import pandas as pd

from config import DURATION_TOLERANCE_MINS


@dataclasses.dataclass
class Finding:
    severity: str       # INFO | WARNING | ERROR | CRITICAL
    rule: str
    message: str
    affected_rows: int = 0


@dataclasses.dataclass
class ValidationReport:
    findings: List[Finding] = dataclasses.field(default_factory=list)

    def add(self, severity: str, rule: str, message: str, affected_rows: int = 0) -> None:
        self.findings.append(Finding(severity, rule, message, affected_rows))

    @property
    def error_count(self) -> int:
        return sum(1 for f in self.findings if f.severity in ("ERROR", "CRITICAL"))

    @property
    def warning_count(self) -> int:
        return sum(1 for f in self.findings if f.severity == "WARNING")

    @property
    def has_critical(self) -> bool:
        return any(f.severity == "CRITICAL" for f in self.findings)

    def summary_dict(self) -> dict:
        counts: dict[str, int] = {"INFO": 0, "WARNING": 0, "ERROR": 0, "CRITICAL": 0}
        for f in self.findings:
            counts[f.severity] = counts.get(f.severity, 0) + 1
        return counts


def validate(df: pd.DataFrame) -> ValidationReport:
    """Run all validation rules and return a ValidationReport."""
    report = ValidationReport()

    if df.empty:
        report.add("CRITICAL", "R01", "Dataset is empty.")
        return report

    report.add("INFO", "R01_SIZE", f"Dataset: {len(df):,} rows × {df.shape[1]} cols.")

    required = [
        "train_number", "train_type", "from_station", "to_station",
        "from_dt", "to_dt", "occupancy_duration_mins",
    ]
    for col in required:
        if col not in df.columns:
            report.add("CRITICAL", f"R02_MISSING_{col}", f"Required column '{col}' absent.")
        else:
            n = int(df[col].isna().sum())
            if n:
                report.add("ERROR", f"R02_NULL_{col}",
                           f"'{col}' has {n:,} null values.", n)
            else:
                report.add("INFO", f"R02_OK_{col}", f"'{col}': no nulls.")

    n_dups = int(df.duplicated().sum())
    if n_dups:
        report.add("WARNING", "R03_DUPS", f"{n_dups:,} duplicate rows.", n_dups)
    else:
        report.add("INFO", "R03_DUPS", "No duplicate rows.")

    valid_ts = df["from_dt"].notna() & df["to_dt"].notna()
    bad_order = int((df[valid_ts]["from_dt"] >= df[valid_ts]["to_dt"]).sum())
    if bad_order:
        report.add("ERROR", "R04_ORDER", f"{bad_order:,} rows: from_dt >= to_dt.", bad_order)
    else:
        report.add("INFO", "R04_ORDER", "All from_dt < to_dt.")

    if "occupancy_duration_mins" in df.columns:
        neg = int((df["occupancy_duration_mins"].dropna() < 0).sum())
        if neg:
            report.add("ERROR", "R05_NEG_DUR", f"{neg:,} rows: duration < 0.", neg)
        else:
            report.add("INFO", "R05_NEG_DUR", "All durations >= 0.")

    subset = df[valid_ts & df["occupancy_duration_mins"].notna()].copy()
    if not subset.empty:
        calc = (subset["to_dt"] - subset["from_dt"]).dt.total_seconds() / 60.0
        mismatch = int(((calc - subset["occupancy_duration_mins"]).abs() > DURATION_TOLERANCE_MINS).sum())
        if mismatch:
            report.add("WARNING", "R06_DUR_MISMATCH",
                       f"{mismatch:,} rows: stored duration deviates > {DURATION_TOLERANCE_MINS} min.",
                       mismatch)
        else:
            report.add("INFO", "R06_DUR_MATCH", "Stored duration consistent with timestamps.")

    if "from_station" in df.columns and "to_station" in df.columns:
        same = int((df["from_station"] == df["to_station"]).sum())
        if same:
            report.add("ERROR", "R07_SAME_ST", f"{same:,} rows: from_station == to_station.", same)
        else:
            report.add("INFO", "R07_SAME_ST", "No same-station rows.")

    if "train_number" in df.columns:
        bad_tn = int((df["train_number"].dropna() <= 0).sum())
        if bad_tn:
            report.add("ERROR", "R08_TRAIN_NUM", f"{bad_tn:,} rows: train_number <= 0.", bad_tn)
        else:
            report.add("INFO", "R08_TRAIN_NUM",
                       f"{df['train_number'].nunique()} unique train numbers, all > 0.")

    stations = set(df["from_station"].dropna()) | set(df["to_station"].dropna())
    report.add("INFO", "R09_STATIONS",
               f"{len(stations)} unique station codes (self-consistent).")

    return report
