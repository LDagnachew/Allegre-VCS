"""Measure-level MusicXML diff logic."""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Iterable

from allegrevcs_diff.models import (
    DiffResult,
    DiffSummary,
    DynamicEvent,
    MeasureChange,
    MeasureDiff,
    MeasureSnapshot,
    NoteEvent,
    ScoreSnapshot,
)
from allegrevcs_diff.parser import parse_score


def diff_files(baseline_path: str | Path, modified_path: str | Path) -> DiffResult:
    """Diff two MusicXML files on disk."""
    return diff_scores(parse_score(baseline_path), parse_score(modified_path))


def diff_scores(baseline: ScoreSnapshot, modified: ScoreSnapshot) -> DiffResult:
    """Produce a measure-level DiffResult from two parsed scores."""
    measures: list[MeasureDiff] = []
    summary = DiffSummary()

    part_ids = sorted(set(baseline.parts) | set(modified.parts))
    for part_id in part_ids:
        base_measures = baseline.parts.get(part_id, {})
        mod_measures = modified.parts.get(part_id, {})
        numbers = sorted(set(base_measures) | set(mod_measures))

        for number in numbers:
            base = base_measures.get(number) or MeasureSnapshot(
                number=number, part_id=part_id
            )
            mod = mod_measures.get(number) or MeasureSnapshot(
                number=number, part_id=part_id
            )
            changes = list(_diff_measure(base, mod))
            if not changes:
                continue

            for change in changes:
                _accumulate(summary, change)

            measures.append(
                MeasureDiff(number=number, part=part_id, changes=changes)
            )

    measures.sort(key=lambda m: (m.part, m.number))
    return DiffResult(summary=summary, measures=measures)


def _accumulate(summary: DiffSummary, change: MeasureChange) -> None:
    if change.type.endswith("_added"):
        summary.additions += 1
    elif change.type.endswith("_removed"):
        summary.deletions += 1
    else:
        summary.changes += 1


def _diff_measure(
    baseline: MeasureSnapshot, modified: MeasureSnapshot
) -> Iterable[MeasureChange]:
    yield from _diff_notes(baseline.notes, modified.notes)
    yield from _diff_dynamics(baseline.dynamics, modified.dynamics)


def _diff_notes(
    baseline: list[NoteEvent], modified: list[NoteEvent]
) -> Iterable[MeasureChange]:
    """Pair notes by identity key; report adds/removes/changes (articulations)."""
    base_by_key: dict[tuple, list[NoteEvent]] = {}
    for n in baseline:
        base_by_key.setdefault(n.identity_key(), []).append(n)

    mod_by_key: dict[tuple, list[NoteEvent]] = {}
    for n in modified:
        mod_by_key.setdefault(n.identity_key(), []).append(n)

    all_keys = sorted(
        set(base_by_key) | set(mod_by_key),
        key=lambda k: tuple("" if x is None else x for x in k),
    )
    for key in all_keys:
        base_list = list(base_by_key.get(key, []))
        mod_list = list(mod_by_key.get(key, []))

        # Pair by occurrence count at the same identity.
        paired = min(len(base_list), len(mod_list))
        for i in range(paired):
            b, m = base_list[i], mod_list[i]
            if b.articulations != m.articulations:
                added = sorted(set(m.articulations) - set(b.articulations))
                removed = sorted(set(b.articulations) - set(m.articulations))
                if added:
                    yield MeasureChange(
                        type="articulation_added",
                        detail={"note": m.to_dict(), "articulations": added},
                    )
                if removed:
                    yield MeasureChange(
                        type="articulation_removed",
                        detail={"note": b.to_dict(), "articulations": removed},
                    )

        for n in mod_list[paired:]:
            yield MeasureChange(type="note_added", detail={"note": n.to_dict()})
        for n in base_list[paired:]:
            yield MeasureChange(type="note_removed", detail={"note": n.to_dict()})


def _diff_dynamics(
    baseline: list[DynamicEvent], modified: list[DynamicEvent]
) -> Iterable[MeasureChange]:
    """Multiset diff on (offset, mark); same-offset different mark → changed."""
    base_counter = Counter((d.offset, d.mark) for d in baseline)
    mod_counter = Counter((d.offset, d.mark) for d in modified)

    base_only = base_counter - mod_counter
    mod_only = mod_counter - base_counter

    # Prefer "changed" when offset matches but mark differs.
    base_by_offset: dict[float, list[str]] = {}
    for (offset, mark), count in base_only.items():
        base_by_offset.setdefault(offset, []).extend([mark] * count)

    mod_by_offset: dict[float, list[str]] = {}
    for (offset, mark), count in mod_only.items():
        mod_by_offset.setdefault(offset, []).extend([mark] * count)

    handled_base: Counter[tuple[float, str]] = Counter()
    handled_mod: Counter[tuple[float, str]] = Counter()

    for offset in sorted(set(base_by_offset) | set(mod_by_offset)):
        b_marks = list(base_by_offset.get(offset, []))
        m_marks = list(mod_by_offset.get(offset, []))
        paired = min(len(b_marks), len(m_marks))
        for i in range(paired):
            yield MeasureChange(
                type="dynamic_changed",
                detail={
                    "before": {"offset": offset, "mark": b_marks[i]},
                    "after": {"offset": offset, "mark": m_marks[i]},
                },
            )
            handled_base[(offset, b_marks[i])] += 1
            handled_mod[(offset, m_marks[i])] += 1

    for (offset, mark), count in base_only.items():
        remaining = count - handled_base[(offset, mark)]
        for _ in range(remaining):
            yield MeasureChange(
                type="dynamic_removed",
                detail={"dynamic": {"offset": offset, "mark": mark}},
            )

    for (offset, mark), count in mod_only.items():
        remaining = count - handled_mod[(offset, mark)]
        for _ in range(remaining):
            yield MeasureChange(
                type="dynamic_added",
                detail={"dynamic": {"offset": offset, "mark": mark}},
            )
