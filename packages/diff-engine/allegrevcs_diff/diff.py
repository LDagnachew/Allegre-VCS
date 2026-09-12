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
    quantize_time,
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
    """Diff pitched notes. Rests are ignored — they refill when notes are added
    or removed, and MuseScore rest notation is unstable across exports.

    Pairing:
    1. Same offset + pitch → same note (articulation/duration/tie may change)
    2. Same offset, different pitch → note_changed (substitution)
    3. Leftovers → note_added / note_removed
    """
    base_notes = [_normalize_note(n) for n in baseline if not n.is_rest]
    mod_notes = [_normalize_note(n) for n in modified if not n.is_rest]

    used_base = [False] * len(base_notes)
    used_mod = [False] * len(mod_notes)

    # Pass 1: exact (offset, pitch) matches.
    for i, b in enumerate(base_notes):
        for j, m in enumerate(mod_notes):
            if used_mod[j]:
                continue
            if b.offset == m.offset and b.pitch == m.pitch:
                used_base[i] = True
                used_mod[j] = True
                yield from _note_attribute_changes(b, m)
                break

    # Pass 2: leftover notes on the same beat are a substitution, not mixed add+remove.
    for i, b in enumerate(base_notes):
        if used_base[i]:
            continue
        for j, m in enumerate(mod_notes):
            if used_mod[j]:
                continue
            if b.offset == m.offset:
                used_base[i] = True
                used_mod[j] = True
                yield MeasureChange(
                    type="note_changed",
                    detail={"before": b.to_dict(), "after": m.to_dict()},
                )
                break

    for j, m in enumerate(mod_notes):
        if not used_mod[j]:
            yield MeasureChange(type="note_added", detail={"note": m.to_dict()})
    for i, b in enumerate(base_notes):
        if not used_base[i]:
            yield MeasureChange(type="note_removed", detail={"note": b.to_dict()})


def _normalize_note(note: NoteEvent) -> NoteEvent:
    return NoteEvent(
        offset=quantize_time(note.offset),
        pitch=note.pitch,
        duration=quantize_time(note.duration),
        is_rest=note.is_rest,
        articulations=note.articulations,
        tie=note.tie,
    )


def _note_attribute_changes(
    baseline: NoteEvent, modified: NoteEvent
) -> Iterable[MeasureChange]:
    if baseline.articulations != modified.articulations:
        added = sorted(set(modified.articulations) - set(baseline.articulations))
        removed = sorted(set(baseline.articulations) - set(modified.articulations))
        if added:
            yield MeasureChange(
                type="articulation_added",
                detail={"note": modified.to_dict(), "articulations": added},
            )
        if removed:
            yield MeasureChange(
                type="articulation_removed",
                detail={"note": baseline.to_dict(), "articulations": removed},
            )
    if baseline.duration != modified.duration or baseline.tie != modified.tie:
        yield MeasureChange(
            type="note_changed",
            detail={"before": baseline.to_dict(), "after": modified.to_dict()},
        )


def _diff_dynamics(
    baseline: list[DynamicEvent], modified: list[DynamicEvent]
) -> Iterable[MeasureChange]:
    """Multiset diff on (offset, mark); same-offset different mark → changed."""
    base_counter = Counter(
        (quantize_time(d.offset), d.mark) for d in baseline
    )
    mod_counter = Counter((quantize_time(d.offset), d.mark) for d in modified)

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
