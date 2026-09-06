"""
cascade_delay.py — RailNexus Brain / core
Deterministic event-driven cascade delay simulation engine.

Phase 2 implementation:
- Tracks chronological movement propagation along each train sequence.
- Implements an event-driven FIFO queue for multi-tier cascading delays.
- Uses effective timings (respecting already accumulated delays) for secondary conflicts.
- Evaluates deterministic two-way precedence semantics (earlier effective arrival wins).
- Adheres to non-double-counting metric identities:
    total_delay_minutes = direct_delay_minutes + secondary_delay_minutes
    cascade_delay_minutes = secondary_delay_minutes
    propagated_delay_minutes = sum of downstream shifts (reported in trace)
"""

from __future__ import annotations

import logging
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional, Set, Tuple

from config import CASCADE_SIMULATION_VERSION, MAX_CASCADE_DEPTH
from core.candidate_windows import CandidateWindow
from core.conflict_engine import ConflictRecord, ConflictType
from core.direct_delay import calculate_direct_delay, calculate_total_direct_delay
from core.train_sequence import MovementId, MovementRecord, TrainSequenceRepository

logger = logging.getLogger(__name__)


class DelayType(str, Enum):
    DIRECT = "DIRECT"
    PROPAGATED = "PROPAGATED"
    SECONDARY = "SECONDARY"


@dataclass
class DelayEvent:
    """An atomic delay injection event placed in the propagation queue."""
    train_number: int
    movement_index: int
    delay_minutes: float
    cause: DelayType
    source_train: Optional[int] = None
    source_movement: Optional[int] = None
    reason: str = ""


@dataclass
class DelayTraceRecord:
    """Structured audit trace for every delay event during simulation."""
    train_number: int
    movement_index: int
    delay_type: str
    delay_minutes: float
    from_station: str
    to_station: str
    original_start: str
    original_end: str
    shifted_start: str
    shifted_end: str
    source_train_number: Optional[int] = None
    source_movement_index: Optional[int] = None
    reason: str = ""

    def to_dict(self) -> dict:
        return {
            "train_number": self.train_number,
            "movement_index": self.movement_index,
            "delay_type": self.delay_type,
            "delay_minutes": self.delay_minutes,
            "from_station": self.from_station,
            "to_station": self.to_station,
            "original_start": self.original_start,
            "original_end": self.original_end,
            "shifted_start": self.shifted_start,
            "shifted_end": self.shifted_end,
            "source_train_number": self.source_train_number,
            "source_movement_index": self.source_movement_index,
            "reason": self.reason,
        }


@dataclass
class CascadeResult:
    """Summary of cascade delay simulation results."""
    direct_delay_minutes: float
    propagated_delay_minutes: float
    secondary_delay_minutes: float
    cascade_delay_minutes: float
    total_delay_minutes: float
    status: str
    notes: str
    trace: List[DelayTraceRecord]
    structured_reason: Optional[Dict[str, str]] = None


def _has_precedence(
    mov_a: MovementRecord,
    eff_start_a: datetime,
    mov_b: MovementRecord,
    eff_start_b: datetime,
) -> bool:
    """
    Determine precedence between two conflicting movements on the same section.

    PROTOTYPE ASSUMPTION PRECEDENCE POLICY:
      1. Earlier effective start wins.
      2. If equal, earlier original movement start wins.
      3. If equal, lower train number wins.
      4. If equal, lower movement index wins.

    NOTE: This is a computational prototype assumption and NOT an official
    railway dispatch rule.
    """
    if eff_start_a != eff_start_b:
        return eff_start_a < eff_start_b
    if mov_a.from_dt != mov_b.from_dt:
        return mov_a.from_dt < mov_b.from_dt
    if mov_a.train_number != mov_b.train_number:
        return mov_a.train_number < mov_b.train_number
    return mov_a.movement_index < mov_b.movement_index


def simulate_cascade_delay(
    window: CandidateWindow,
    conflicts: List[ConflictRecord],
    sequence_repo: TrainSequenceRepository,
    max_depth: int = MAX_CASCADE_DEPTH,
) -> CascadeResult:
    """
    Simulate chronological cascade delay using an event-driven FIFO propagation queue.

    Workflow:
      1. Initial direct delay events for ENTRY_BLOCKED trains.
      2. Event queue pops (train_number, movement_index, delay, cause).
      3. Propagates downstream along the same train sequence.
      4. For every shifted movement, checks secondary conflicts on that exact section.
      5. Evaluates both precedence directions using current effective timings.
      6. Incurred secondary conflicts shift the losing train and enqueue new DelayEvents.
      7. Continues until queue is empty, broken sequence, or max_depth is reached.
    """
    current_delays: Dict[MovementId, float] = {}
    trace: List[DelayTraceRecord] = []
    queue: deque[DelayEvent] = deque()
    resolved_conflicts: Set[Tuple[MovementId, MovementId, float, float]] = set()

    # 1. Enqueue initial direct delays for ENTRY_BLOCKED trains
    depth_counter = 0
    hit_max_depth = False
    broken_sequence_encountered = False

    for c in conflicts:
        if c.conflict_type != ConflictType.ENTRY_BLOCKED:
            continue

        direct_delay = calculate_direct_delay(window, c)
        if direct_delay <= 0.0:
            continue

        seq = sequence_repo.get_sequence(c.train_number) if sequence_repo else None
        mov = seq.find_movement(c.from_station, c.to_station, c.train_entry, c.train_exit) if seq else None

        orig_start = mov.from_dt if mov else c.train_entry
        orig_end = mov.to_dt if mov else c.train_exit
        shifted_start = orig_start + timedelta(minutes=direct_delay)
        dur_mins = mov.occupancy_duration_mins if mov else max(0.0, (orig_end - orig_start).total_seconds() / 60.0)
        shifted_end = shifted_start + timedelta(minutes=dur_mins)
        m_idx = mov.movement_index if mov else 0

        trace.append(
            DelayTraceRecord(
                train_number=c.train_number,
                movement_index=m_idx,
                delay_type=DelayType.DIRECT.value,
                delay_minutes=round(direct_delay, 2),
                from_station=c.from_station,
                to_station=c.to_station,
                original_start=orig_start.strftime("%Y-%m-%d %H:%M"),
                original_end=orig_end.strftime("%Y-%m-%d %H:%M"),
                shifted_start=shifted_start.strftime("%Y-%m-%d %H:%M"),
                shifted_end=shifted_end.strftime("%Y-%m-%d %H:%M"),
                source_train_number=None,
                source_movement_index=None,
                reason="DIRECT_MAINTENANCE_BLOCK",
            )
        )

        if not seq or not mov:
            logger.debug(
                "Sequence or movement not found in sequence_repo for train %d at [%s->%s]; "
                "direct delay recorded in trace, but downstream propagation stopped.",
                c.train_number,
                c.from_station,
                c.to_station,
            )
            broken_sequence_encountered = True
            continue

        m_id = mov.movement_id
        current_delays[m_id] = direct_delay

        queue.append(
            DelayEvent(
                train_number=mov.train_number,
                movement_index=mov.movement_index,
                delay_minutes=direct_delay,
                cause=DelayType.DIRECT,
                source_train=None,
                source_movement=None,
                reason="DIRECT_MAINTENANCE_BLOCK",
            )
        )

    # 2. Event-driven queue loop

    while queue:
        if depth_counter >= max_depth:
            hit_max_depth = True
            logger.warning(
                "Cascade propagation reached MAX_CASCADE_DEPTH=%d; stopping.", max_depth
            )
            break

        event = queue.popleft()
        depth_counter += 1

        seq = sequence_repo.get_sequence(event.train_number)
        if not seq:
            continue

        curr_mov = seq.get_movement(event.movement_index)
        if not curr_mov:
            continue

        # Step A: Propagate delay downstream along the SAME train
        subsequent_movements = seq.get_subsequent_movements(event.movement_index)
        prev_mov = curr_mov

        for sub_mov in subsequent_movements:
            # Check sequence continuity
            if not seq.is_continuous_transition(prev_mov.movement_index, sub_mov.movement_index):
                logger.debug(
                    "Broken sequence detected between %s and %s for train %d; propagation stopped.",
                    prev_mov.to_station,
                    sub_mov.from_station,
                    event.train_number,
                )
                broken_sequence_encountered = True
                break

            # Preserve observed gaps
            orig_gap_sec = (sub_mov.from_dt - prev_mov.to_dt).total_seconds()
            gap_mins = max(0.0, orig_gap_sec / 60.0)

            # Previous movement's effective end
            prev_delay = current_delays.get(prev_mov.movement_id, 0.0)
            prev_effective_end = prev_mov.from_dt + timedelta(
                minutes=prev_delay + prev_mov.occupancy_duration_mins
            )

            # This movement's shifted arrival
            shifted_start_dt = prev_effective_end + timedelta(minutes=gap_mins)
            calculated_delay = max(
                0.0, (shifted_start_dt - sub_mov.from_dt).total_seconds() / 60.0
            )

            existing_delay = current_delays.get(sub_mov.movement_id, 0.0)
            if calculated_delay <= existing_delay + 0.001:
                prev_mov = sub_mov
                continue

            shift_increment = calculated_delay - existing_delay
            current_delays[sub_mov.movement_id] = calculated_delay

            sub_shifted_end_dt = shifted_start_dt + timedelta(
                minutes=sub_mov.occupancy_duration_mins
            )

            trace.append(
                DelayTraceRecord(
                    train_number=sub_mov.train_number,
                    movement_index=sub_mov.movement_index,
                    delay_type=DelayType.PROPAGATED.value,
                    delay_minutes=round(shift_increment, 2),
                    from_station=sub_mov.from_station,
                    to_station=sub_mov.to_station,
                    original_start=sub_mov.from_dt.strftime("%Y-%m-%d %H:%M"),
                    original_end=sub_mov.to_dt.strftime("%Y-%m-%d %H:%M"),
                    shifted_start=shifted_start_dt.strftime("%Y-%m-%d %H:%M"),
                    shifted_end=sub_shifted_end_dt.strftime("%Y-%m-%d %H:%M"),
                    source_train_number=prev_mov.train_number,
                    source_movement_index=prev_mov.movement_index,
                    reason="SAME_TRAIN_DOWNSTREAM_PROPAGATION",
                )
            )

            # Step B: Check secondary conflicts caused by this shifted downstream movement
            _check_and_enqueue_secondary_conflicts(
                shifting_movement=sub_mov,
                sequence_repo=sequence_repo,
                current_delays=current_delays,
                queue=queue,
                trace=trace,
                resolved_conflicts=resolved_conflicts,
            )

            prev_mov = sub_mov

        # Also check secondary conflicts for the trigger movement itself
        _check_and_enqueue_secondary_conflicts(
            shifting_movement=curr_mov,
            sequence_repo=sequence_repo,
            current_delays=current_delays,
            queue=queue,
            trace=trace,
            resolved_conflicts=resolved_conflicts,
        )

    # Compute totals cleanly from trace records
    direct_delay_total = sum(
        t.delay_minutes for t in trace if t.delay_type == DelayType.DIRECT.value
    )
    # Correctness guarantee: ensure direct_delay_total accounts for all direct delays
    baseline_direct = calculate_total_direct_delay(window, conflicts)
    direct_delay_total = max(direct_delay_total, baseline_direct)

    secondary_delay_total = sum(
        t.delay_minutes for t in trace if t.delay_type == DelayType.SECONDARY.value
    )
    # Non-additive downstream propagation trace metric (sum of downstream schedule shifts)
    propagated_delay_total = sum(
        t.delay_minutes for t in trace if t.delay_type == DelayType.PROPAGATED.value
    )

    if hit_max_depth:
        status = "PARTIAL"
        structured_reason = {
            "code": "MAX_CASCADE_DEPTH_REACHED",
            "message": "Cascade propagation stopped at configured technical depth.",
        }
    elif broken_sequence_encountered:
        status = "PARTIAL"
        structured_reason = {
            "code": "BROKEN_SEQUENCE",
            "message": "Cascade propagation stopped along train sequence due to missing track connection boundary or movement in dataset.",
        }
    else:
        status = CASCADE_SIMULATION_VERSION
        structured_reason = None

    cascade_delay_total = secondary_delay_total
    total_delay_net = direct_delay_total + secondary_delay_total

    notes = (
        f"Cascade simulation {status}: "
        f"direct={round(direct_delay_total, 2)}m, "
        f"propagated={round(propagated_delay_total, 2)}m, "
        f"secondary={round(secondary_delay_total, 2)}m, "
        f"total={round(total_delay_net, 2)}m across {len(trace)} events."
    )

    return CascadeResult(
        direct_delay_minutes=round(direct_delay_total, 2),
        propagated_delay_minutes=round(propagated_delay_total, 2),
        secondary_delay_minutes=round(secondary_delay_total, 2),
        cascade_delay_minutes=round(cascade_delay_total, 2),
        total_delay_minutes=round(total_delay_net, 2),
        status=status,
        notes=notes,
        trace=trace,
        structured_reason=structured_reason,
    )


def _check_and_enqueue_secondary_conflicts(
    shifting_movement: MovementRecord,
    sequence_repo: TrainSequenceRepository,
    current_delays: Dict[MovementId, float],
    queue: deque[DelayEvent],
    trace: List[DelayTraceRecord],
    resolved_conflicts: Set[Tuple[MovementId, MovementId, float, float]],
) -> None:
    """
    Check if shifting_movement in its effective timing conflicts with any
    other train movement on the EXACT same section.

    Evaluates both precedence directions:
      - If shifting_movement has precedence: the other train is delayed to clearing time.
      - If the other train has precedence: shifting_movement is delayed to clearing time.
      - Losing train receives secondary waiting delay and is enqueued to propagate downstream.

    PROTOTYPE ASSUMPTION (SIMPLIFIED FIRST-CLEARS OCCUPANCY):
      Secondary delay is calculated as (winner_eff_end - loser_eff_start), assuming the winner
      holds the track section until completely clearing and the loser is held at the section
      entrance until that instant.
      This is an explicit SIMPLIFIED PROTOTYPE ASSUMPTION for deterministic simulation. It does
      not model full railway signaling/interlocking blocks, dynamic speed restrictions, or
      dispatcher overrides.
    """
    sec_movements = sequence_repo.get_section_movements(
        shifting_movement.from_station, shifting_movement.to_station
    )
    if not sec_movements:
        return

    sec_movements = sorted(
        sec_movements,
        key=lambda m: (m.from_dt, m.train_number, m.movement_index),
    )

    for other_mov in sec_movements:
        if other_mov.train_number == shifting_movement.train_number:
            continue

        a_delay = current_delays.get(shifting_movement.movement_id, 0.0)
        b_delay = current_delays.get(other_mov.movement_id, 0.0)

        if a_delay <= 0.0 and b_delay <= 0.0:
            continue

        eff_start_a = shifting_movement.from_dt + timedelta(minutes=a_delay)
        eff_end_a = eff_start_a + timedelta(minutes=shifting_movement.occupancy_duration_mins)

        eff_start_b = other_mov.from_dt + timedelta(minutes=b_delay)
        eff_end_b = eff_start_b + timedelta(minutes=other_mov.occupancy_duration_mins)

        # Check temporal overlap on exact section
        if max(eff_start_a, eff_start_b) < min(eff_end_a, eff_end_b):
            m_first, m_second = (
                (shifting_movement.movement_id, other_mov.movement_id)
                if shifting_movement.movement_id < other_mov.movement_id
                else (other_mov.movement_id, shifting_movement.movement_id)
            )
            conflict_key = (
                m_first,
                m_second,
                round(current_delays.get(m_first, 0.0), 2),
                round(current_delays.get(m_second, 0.0), 2),
            )
            if conflict_key in resolved_conflicts:
                continue
            resolved_conflicts.add(conflict_key)

            a_has_precedence = _has_precedence(
                shifting_movement, eff_start_a, other_mov, eff_start_b
            )

            if a_has_precedence:
                winner_mov = shifting_movement
                winner_end = eff_end_a
                loser_mov = other_mov
                loser_start = eff_start_b
                loser_existing_delay = b_delay
            else:
                winner_mov = other_mov
                winner_end = eff_end_b
                loser_mov = shifting_movement
                loser_start = eff_start_a
                loser_existing_delay = a_delay

            secondary_delay = max(
                0.0, (winner_end - loser_start).total_seconds() / 60.0
            )
            if secondary_delay <= 0.001:
                continue

            new_loser_delay = loser_existing_delay + secondary_delay
            current_delays[loser_mov.movement_id] = new_loser_delay

            loser_shifted_start = loser_start + timedelta(minutes=secondary_delay)
            loser_shifted_end = loser_shifted_start + timedelta(
                minutes=loser_mov.occupancy_duration_mins
            )

            trace.append(
                DelayTraceRecord(
                    train_number=loser_mov.train_number,
                    movement_index=loser_mov.movement_index,
                    delay_type=DelayType.SECONDARY.value,
                    delay_minutes=round(secondary_delay, 2),
                    from_station=loser_mov.from_station,
                    to_station=loser_mov.to_station,
                    original_start=loser_mov.from_dt.strftime("%Y-%m-%d %H:%M"),
                    original_end=loser_mov.to_dt.strftime("%Y-%m-%d %H:%M"),
                    shifted_start=loser_shifted_start.strftime("%Y-%m-%d %H:%M"),
                    shifted_end=loser_shifted_end.strftime("%Y-%m-%d %H:%M"),
                    source_train_number=winner_mov.train_number,
                    source_movement_index=winner_mov.movement_index,
                    reason="PROTOTYPE_ASSUMPTION_PRECEDENCE",
                )
            )

            queue.append(
                DelayEvent(
                    train_number=loser_mov.train_number,
                    movement_index=loser_mov.movement_index,
                    delay_minutes=secondary_delay,
                    cause=DelayType.SECONDARY,
                    source_train=winner_mov.train_number,
                    source_movement=winner_mov.movement_index,
                    reason="PROTOTYPE_ASSUMPTION_PRECEDENCE",
                )
            )


def calculate_cascade_delay(
    window: CandidateWindow,
    conflicts: List[ConflictRecord],
) -> CascadeResult:
    """
    Fallback for legacy calls without sequence_repo.
    """
    return CascadeResult(
        direct_delay_minutes=0.0,
        propagated_delay_minutes=0.0,
        secondary_delay_minutes=0.0,
        cascade_delay_minutes=0.0,
        total_delay_minutes=0.0,
        status="NOT_IMPLEMENTED",
        notes="Sequence repository not provided for cascade simulation.",
        trace=[],
        structured_reason=None,
    )
