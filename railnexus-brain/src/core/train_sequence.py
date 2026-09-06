"""
train_sequence.py — RailNexus Brain / core
Chronological train movement sequence modeling and sequence repository.

Provides structured movement sequencing, continuity verification, and fast
pre-indexed lookups for Phase 2 cascade delay propagation.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Dict, List, NamedTuple, Optional, Tuple

import pandas as pd

logger = logging.getLogger(__name__)


class MovementId(NamedTuple):
    """Stable identifier for a train movement within its sequence."""
    train_number: int
    movement_index: int


class MovementRecord:
    """Represents a single atomic block movement of a train."""

    __slots__ = (
        "movement_id",
        "train_number",
        "movement_index",
        "train_type",
        "from_station",
        "to_station",
        "from_dt",
        "to_dt",
        "occupancy_duration_mins",
        "block_section_km",
        "day",
    )

    def __init__(
        self,
        train_number: int,
        movement_index: int,
        train_type: str,
        from_station: str,
        to_station: str,
        from_dt: datetime,
        to_dt: datetime,
        occupancy_duration_mins: float,
        block_section_km: float = 0.0,
        day: float = 0.0,
    ) -> None:
        self.movement_id = MovementId(train_number, movement_index)
        self.train_number = train_number
        self.movement_index = movement_index
        self.train_type = train_type
        self.from_station = from_station
        self.to_station = to_station
        self.from_dt = from_dt
        self.to_dt = to_dt
        self.occupancy_duration_mins = occupancy_duration_mins
        self.block_section_km = block_section_km
        self.day = day

    @property
    def section(self) -> Tuple[str, str]:
        return (self.from_station, self.to_station)

    def __repr__(self) -> str:
        return (
            f"<MovementRecord {self.train_number}[{self.movement_index}] "
            f"{self.from_station}->{self.to_station} "
            f"{self.from_dt.strftime('%H:%M')}..{self.to_dt.strftime('%H:%M')}>"
        )


class TrainMovementSequence:
    """
    Chronologically ordered sequence of movements for a single train.
    """

    def __init__(self, train_number: int, movements: List[MovementRecord]) -> None:
        self.train_number = train_number
        # Ensure sorted by from_dt, then to_dt
        self.movements = sorted(movements, key=lambda m: (m.from_dt, m.to_dt))
        # Re-assign sequential movement_index to guarantee 0-indexed contiguous positions
        for idx, m in enumerate(self.movements):
            m.movement_index = idx
            m.movement_id = MovementId(self.train_number, idx)

    def __len__(self) -> int:
        return len(self.movements)

    def __iter__(self):
        return iter(self.movements)

    def get_movement(self, index: int) -> Optional[MovementRecord]:
        if 0 <= index < len(self.movements):
            return self.movements[index]
        return None

    def get_subsequent_movements(self, from_index: int) -> List[MovementRecord]:
        """Return movements strictly after from_index."""
        if from_index + 1 < len(self.movements):
            return self.movements[from_index + 1 :]
        return []

    def is_continuous_transition(self, current_index: int, next_index: int) -> bool:
        """
        Check if transition between current_index and next_index is continuous.
        Continuous requires:
          1. next_index == current_index + 1
          2. current.to_station == next.from_station
        """
        curr = self.get_movement(current_index)
        nxt = self.get_movement(next_index)
        if curr is None or nxt is None:
            return False
        return nxt.from_station == curr.to_station

    def find_movement(
        self,
        from_station: str,
        to_station: str,
        from_dt: datetime,
        to_dt: datetime,
    ) -> Optional[MovementRecord]:
        """Find matching movement on exact section and matching time window."""
        for m in self.movements:
            if (
                m.from_station == from_station
                and m.to_station == to_station
                and m.from_dt == from_dt
                and m.to_dt == to_dt
            ):
                return m
        # Fallback to section and time overlap if exact match not found
        for m in self.movements:
            if (
                m.from_station == from_station
                and m.to_station == to_station
                and m.from_dt < to_dt
                and m.to_dt > from_dt
            ):
                return m
        return None


class TrainSequenceRepository:
    """
    Repository for sequence-aware train operations.
    Pre-indexes trains into sequences and sections for high-performance cascade simulation.
    """

    def __init__(self, df: pd.DataFrame) -> None:
        self._sequences: Dict[int, TrainMovementSequence] = {}
        self._section_index: Dict[Tuple[str, str], List[MovementRecord]] = {}
        self._all_movements: List[MovementRecord] = []
        self._build_index(df)

    def _build_index(self, df: pd.DataFrame) -> None:
        valid_df = df[df["from_dt"].notna() & df["to_dt"].notna()].copy()

        # Group by train_number
        grouped = valid_df.groupby("train_number")
        for train_num, group in grouped:
            train_int = int(train_num)
            sorted_group = group.sort_values(by=["from_dt", "to_dt"])
            records: List[MovementRecord] = []
            for idx, (_, row) in enumerate(sorted_group.iterrows()):
                dur = (
                    float(row["occupancy_duration_mins"])
                    if pd.notna(row.get("occupancy_duration_mins"))
                    else max(0.0, (row["to_dt"] - row["from_dt"]).total_seconds() / 60.0)
                )
                km = float(row["block_section_km"]) if pd.notna(row.get("block_section_km")) else 0.0
                day = float(row["day"]) if pd.notna(row.get("day")) else 0.0
                rec = MovementRecord(
                    train_number=train_int,
                    movement_index=idx,
                    train_type=str(row["train_type"]),
                    from_station=str(row["from_station"]),
                    to_station=str(row["to_station"]),
                    from_dt=row["from_dt"],
                    to_dt=row["to_dt"],
                    occupancy_duration_mins=dur,
                    block_section_km=km,
                    day=day,
                )
                records.append(rec)
                self._all_movements.append(rec)

                sec = rec.section
                if sec not in self._section_index:
                    self._section_index[sec] = []
                self._section_index[sec].append(rec)

            self._sequences[train_int] = TrainMovementSequence(train_int, records)

        # Sort all section buckets by from_dt
        for sec in self._section_index:
            self._section_index[sec].sort(key=lambda m: (m.from_dt, m.to_dt))

        logger.info(
            "TrainSequenceRepository indexed %d trains, %d movements across %d sections.",
            len(self._sequences),
            len(self._all_movements),
            len(self._section_index),
        )

    def get_sequence(self, train_number: int) -> Optional[TrainMovementSequence]:
        return self._sequences.get(train_number)

    def get_section_movements(self, from_station: str, to_station: str) -> List[MovementRecord]:
        return self._section_index.get((from_station, to_station), [])

    def get_movement(self, movement_id: MovementId) -> Optional[MovementRecord]:
        seq = self._sequences.get(movement_id.train_number)
        if seq:
            return seq.get_movement(movement_id.movement_index)
        return None
