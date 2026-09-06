"""
explanation.py — RailNexus Brain / core
Generates a deterministic, data-driven explanation of the recommendation.

Rules:
  - Generated ONLY from calculated values — never invented.
  - No LLM. No ML. No heuristic text.
  - cascade_delay is always explicitly marked NOT_IMPLEMENTED.
"""

from __future__ import annotations

from typing import List, Optional

from core.candidate_windows import CandidateWindow
from core.conflict_engine import ConflictRecord


def generate_explanation(
    best_window: Optional[CandidateWindow],
    conflicts: List[ConflictRecord],
    all_windows: List[CandidateWindow],
    from_station: str,
    to_station: str,
    duration_minutes: int,
) -> str:
    """
    Build a human-readable explanation of the recommendation.

    Parameters
    ----------
    best_window      : the recommended CandidateWindow (None → no window found).
    conflicts        : ConflictRecords for the best window.
    all_windows      : all scored candidate windows.
    from_station, to_station : the maintenance section.
    duration_minutes : required maintenance duration.

    Returns
    -------
    str  — multi-line explanation.
    """
    if best_window is None:
        return (
            f"NO FEASIBLE WINDOW FOUND for section {from_station}->{to_station}. "
            f"No {duration_minutes}-minute window could be scheduled within the "
            f"requested time range without exceeding its bounds."
        )

    n_candidates = len(all_windows)
    start_str = best_window.start.strftime("%Y-%m-%dT%H:%M:%S")
    end_str   = best_window.end.strftime("%Y-%m-%dT%H:%M:%S")

    lines = [
        f"Recommended window: {start_str} -> {end_str}",
        "",
        "Reason:",
        f"  This window produced the lowest calculated direct delay among "
        f"  the {n_candidates} evaluated candidate window(s) for section "
        f"  {from_station}->{to_station}.",
        "",
        f"Conflicts        : {best_window.conflict_count}",
    ]

    if conflicts:
        train_list = ", ".join(str(c.train_number) for c in conflicts)
        lines.append(f"Affected trains  : {train_list}")
    else:
        lines.append("Affected trains  : none")

    if getattr(best_window, "cascade_status", None) in ("PHASE_2_DETERMINISTIC", "PARTIAL"):
        lines += [
            f"Direct delay     : {best_window.direct_delay_minutes:.2f} minutes",
            f"Propagated delay : {best_window.propagated_delay_minutes:.2f} minutes",
            f"Secondary delay  : {best_window.secondary_delay_minutes:.2f} minutes",
            f"Cascade delay    : {best_window.cascade_delay_minutes:.2f} minutes ({best_window.cascade_status})",
            f"Total delay      : {best_window.total_delay_minutes:.2f} minutes",
            f"Impact score     : {best_window.impact_score:.2f}",
            "",
            "Delay Accounting & Attribution:",
            f"  Total network delay ({best_window.total_delay_minutes:.2f} min) represents net attributable delay",
            f"  (direct {best_window.direct_delay_minutes:.2f} min + secondary {best_window.secondary_delay_minutes:.2f} min).",
            f"  Propagation impact ({best_window.propagated_delay_minutes:.2f} min) reflects same-train downstream movements",
            "  carrying schedule shifts forward (non-additive trace metric) and is not counted again as independent delay.",
            "  Secondary conflict resolution uses a simplified first-clears model under prototype precedence assumptions.",
        ]

        trace = getattr(best_window, "delay_trace", [])
        if trace:
            train_direct: dict[int, float] = {}
            train_sec: dict[int, float] = {}
            prop_events_by_train: dict[int, int] = {}
            for t in trace:
                tn = t.get("train_number") if isinstance(t, dict) else getattr(t, "train_number", None)
                dtype = t.get("delay_type") if isinstance(t, dict) else getattr(t, "delay_type", None)
                mins = t.get("delay_minutes", 0.0) if isinstance(t, dict) else getattr(t, "delay_minutes", 0.0)
                if tn is None:
                    continue
                if dtype == "DIRECT":
                    train_direct[tn] = train_direct.get(tn, 0.0) + mins
                elif dtype == "SECONDARY":
                    train_sec[tn] = train_sec.get(tn, 0.0) + mins
                elif dtype == "PROPAGATED":
                    prop_events_by_train[tn] = prop_events_by_train.get(tn, 0) + 1

            all_trains = sorted(set(train_direct.keys()) | set(train_sec.keys()))
            if all_trains:
                lines.append("")
                lines.append("  Final Attributable Delay by Train:")
                for tn in all_trains:
                    d_mins = train_direct.get(tn, 0.0)
                    s_mins = train_sec.get(tn, 0.0)
                    t_total = d_mins + s_mins
                    p_moves = prop_events_by_train.get(tn, 0)
                    detail = []
                    if d_mins > 0:
                        detail.append(f"direct: {d_mins:.2f}m")
                    if s_mins > 0:
                        detail.append(f"secondary: {s_mins:.2f}m")
                    if p_moves > 0:
                        detail.append(f"propagated across {p_moves} movement(s)")
                    desc = f" ({', '.join(detail)})" if detail else ""
                    lines.append(f"    Train {tn}: {t_total:.2f} minutes{desc}")
    breakdown = getattr(best_window, "score_breakdown", [])
    if breakdown:
        bd_map = {b.get("factor"): b for b in breakdown if isinstance(b, dict)}
        delay_item = bd_map.get("total_delay", {})
        affected_item = bd_map.get("affected_train_count", {})
        train_prio_item = bd_map.get("train_priority", {})
        maint_prio_item = bd_map.get("maintenance_priority", {})

        lines.append("")
        lines.append(f"Impact score: {best_window.impact_score:.2f}")
        lines.append("")
        lines.append("Score breakdown:")

        d_raw = delay_item.get("raw_value", best_window.total_delay_minutes)
        d_wt = delay_item.get("weight", 1.0)
        d_val = delay_item.get("weighted_value", d_raw * d_wt)
        lines.append(f"• Attributable total delay: {d_raw:.2f} × {d_wt:.2f} = {d_val:.2f}")

        a_raw = affected_item.get("raw_value", 0.0)
        a_wt = affected_item.get("weight", 0.0)
        a_val = affected_item.get("weighted_value", 0.0)
        lines.append(f"• Affected trains: {int(a_raw)} × {a_wt:.2f} = {a_val:.2f}")

        tp_raw = train_prio_item.get("raw_value", 0.0)
        tp_wt = train_prio_item.get("weight", 0.0)
        tp_val = train_prio_item.get("weighted_value", 0.0)
        if tp_wt > 0.0:
            lines.append(f"• Train priority factor: {tp_raw:.2f} × {tp_wt:.2f} = {tp_val:.2f}")
        else:
            lines.append("• Train priority factor: disabled")

        mp_raw = maint_prio_item.get("raw_value", 0.0)
        mp_wt = maint_prio_item.get("weight", 0.0)
        mp_val = maint_prio_item.get("weighted_value", 0.0)
        if mp_wt > 0.0:
            lines.append(f"• Maintenance priority factor: {mp_raw:.2f} × {mp_wt:.2f} = {mp_val:.2f}")
        else:
            lines.append("• Maintenance priority factor: disabled")

        lines.append("")
        if tp_val == 0.0 and mp_val == 0.0 and a_val == 0.0:
            lines.append("Recommendation is driven by attributable simulated delay.")

        if tp_val > 0.0 or tp_wt > 0.0:
            lines.append("")
            lines.append(f"Train priority contribution:\n+{tp_val:.2f}")
            lines.append("This weighting is a prototype configuration and is not an official railway priority policy.")

        if mp_val > 0.0 or mp_wt > 0.0:
            lines.append("")
            lines.append(f"Maintenance priority contribution:\n+{mp_val:.2f}")
            lines.append("This weighting is a prototype configuration and is not an official railway priority policy.")

    lines += [
        "",
        "Note: The human controller remains the final authority. "
        "This recommendation must be reviewed before any track block is approved.",
    ]

    return "\n".join(lines)
