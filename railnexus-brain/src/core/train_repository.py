"""
train_repository.py — RailNexus Brain / core
Reusable repository for querying train movements from the loaded DataFrame.

Section matching is EXACT string match only.
No geographic proximity inference.
Time overlap: train.from_dt < maint_end AND train.to_dt > maint_start
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import List

import pandas as pd

logger = logging.getLogger(__name__)


class TrainMovement:
    """Lightweight value object representing one train section movement."""

    __slots__ = (
        "train_number", "train_type", "from_station", "to_station",
        "from_dt", "to_dt", "occupancy_duration_mins", "block_section_km", "day",
    )

    def __init__(self, row: pd.Series):
        self.train_number: int               = int(row["train_number"])
        self.train_type: str                 = str(row["train_type"])
        self.from_station: str               = str(row["from_station"])
        self.to_station: str                 = str(row["to_station"])
        self.from_dt: datetime               = row["from_dt"]
        self.to_dt: datetime                 = row["to_dt"]
        self.occupancy_duration_mins: float  = float(row["occupancy_duration_mins"]) \
                                               if pd.notna(row["occupancy_duration_mins"]) else 0.0
        self.block_section_km: float         = float(row["block_section_km"]) \
                                               if pd.notna(row["block_section_km"]) else 0.0
        self.day: float                      = float(row["day"]) if pd.notna(row["day"]) else 0.0


class TrainRepository:
    """
    Query interface over the block-movement DataFrame.

    The underlying DataFrame is never mutated.
    """

    def __init__(self, df: pd.DataFrame) -> None:
        # Keep only rows with valid timestamps
        self._df = df[df["from_dt"].notna() & df["to_dt"].notna()].copy()
        self._sequence_repo = None
        logger.info("TrainRepository initialised with %d valid rows.", len(self._df))

    @property
    def sequence_repo(self):
        if self._sequence_repo is None:
            from core.train_sequence import TrainSequenceRepository
            self._sequence_repo = TrainSequenceRepository(self._df)
        return self._sequence_repo

    # ── public query methods ──────────────────────────────────────────────

    def get_all_trains(self) -> List[TrainMovement]:
        """Return every train movement in the dataset."""
        return [TrainMovement(row) for _, row in self._df.iterrows()]

    def get_trains_by_section(
        self,
        from_station: str,
        to_station: str,
    ) -> List[TrainMovement]:
        """
        Return all movements on exactly the given section.

        Matching is case-sensitive exact string comparison.
        """
        mask = (
            (self._df["from_station"] == from_station)
            & (self._df["to_station"] == to_station)
        )
        return [TrainMovement(row) for _, row in self._df[mask].iterrows()]

    def get_trains_for_time_range(
        self,
        start_time: datetime,
        end_time: datetime,
    ) -> List[TrainMovement]:
        """
        Return all movements whose interval overlaps [start_time, end_time].

        Overlap condition:
          train.from_dt < end_time  AND  train.to_dt > start_time
        """
        if hasattr(start_time, "tzinfo") and start_time.tzinfo is not None:
            start_time = start_time.replace(tzinfo=None)
        if hasattr(end_time, "tzinfo") and end_time.tzinfo is not None:
            end_time = end_time.replace(tzinfo=None)

        mask = (
            (self._df["from_dt"] < end_time)
            & (self._df["to_dt"]  > start_time)
        )
        return [TrainMovement(row) for _, row in self._df[mask].iterrows()]

    def get_trains_for_section_and_time(
        self,
        from_station: str,
        to_station: str,
        start_time: datetime,
        end_time: datetime,
    ) -> List[TrainMovement]:
        """
        Return movements on the exact section that overlap the given window.

        Section match  : exact string equality (both from and to station)
        Time overlap   : train.from_dt < end_time AND train.to_dt > start_time
        """
        if hasattr(start_time, "tzinfo") and start_time.tzinfo is not None:
            start_time = start_time.replace(tzinfo=None)
        if hasattr(end_time, "tzinfo") and end_time.tzinfo is not None:
            end_time = end_time.replace(tzinfo=None)

        mask = (
            (self._df["from_station"] == from_station)
            & (self._df["to_station"]  == to_station)
            & (self._df["from_dt"]     <  end_time)
            & (self._df["to_dt"]       >  start_time)
        )
        return [TrainMovement(row) for _, row in self._df[mask].iterrows()]


    def section_exists(self, from_station: str, to_station: str) -> bool:
        """Return True only when the exact section appears at least once in the dataset."""
        return not self._df[
            (self._df["from_station"] == from_station)
            & (self._df["to_station"]  == to_station)
        ].empty

    def unique_train_count(self) -> int:
        return self._df["train_number"].nunique()

    def unique_station_count(self) -> int:
        return pd.concat([self._df["from_station"], self._df["to_station"]]).nunique()


    def get_unique_stations(self) -> List[str]:
        """Return a sorted list of unique station codes in the dataset."""
        stations = pd.concat([self._df["from_station"], self._df["to_station"]]).dropna().unique()
        return sorted([str(s) for s in stations])

    def get_unique_sections(self) -> List[dict]:
        """Return unique [from_station, to_station] pairs with average distance/duration."""
        grouped = self._df.groupby(["from_station", "to_station"]).agg({
            "block_section_km": "mean",
            "occupancy_duration_mins": "mean"
        }).reset_index()
        sections = []
        for _, row in grouped.iterrows():
            sections.append({
                "from_station": str(row["from_station"]),
                "to_station": str(row["to_station"]),
                "block_section_km": round(float(row["block_section_km"]), 2) if pd.notna(row["block_section_km"]) else 0.0,
                "avg_duration_mins": round(float(row["occupancy_duration_mins"]), 1) if pd.notna(row["occupancy_duration_mins"]) else 0.0,
            })
        return sorted(sections, key=lambda s: (s["from_station"], s["to_station"]))

    def row_count(self) -> int:
        return len(self._df)

