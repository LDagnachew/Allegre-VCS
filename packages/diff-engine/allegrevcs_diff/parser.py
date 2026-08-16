"""music21-based MusicXML parsing into measure snapshots."""

from __future__ import annotations

from pathlib import Path

from music21 import chord, converter, dynamics, note, stream
from music21.articulations import Articulation

from allegrevcs_diff.models import (
    DynamicEvent,
    MeasureSnapshot,
    NoteEvent,
    ScoreSnapshot,
)


def parse_score(path: str | Path) -> ScoreSnapshot:
    """Parse a MusicXML file into a normalized ScoreSnapshot."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"MusicXML file not found: {path}")

    parsed = converter.parse(str(path))
    return score_to_snapshot(parsed)


def score_to_snapshot(score: stream.Stream) -> ScoreSnapshot:
    """Convert a music21 stream into part/measure snapshots."""
    parts: dict[str, dict[int, MeasureSnapshot]] = {}

    for index, part in enumerate(_iter_parts(score)):
        part_id = _part_id(part, index)
        measures_by_number: dict[int, MeasureSnapshot] = {}

        for measure in part.getElementsByClass(stream.Measure):
            number = int(measure.number) if measure.number is not None else 0
            snap = MeasureSnapshot(number=number, part_id=part_id)

            for el in measure.recurse().notesAndRests:
                if not isinstance(el, note.GeneralNote):
                    continue
                if getattr(el, "duration", None) and el.duration.isGrace:
                    continue
                snap.notes.append(_note_event(el))

            for dyn in measure.recurse().getElementsByClass(dynamics.Dynamic):
                snap.dynamics.append(
                    DynamicEvent(offset=float(dyn.offset), mark=str(dyn.value))
                )

            snap.notes.sort(key=lambda n: (n.offset, n.pitch or "", n.duration))
            snap.dynamics.sort(key=lambda d: (d.offset, d.mark))
            measures_by_number[number] = snap

        parts[part_id] = measures_by_number

    return ScoreSnapshot(parts=parts)


def _iter_parts(score: stream.Stream) -> list[stream.Part]:
    if hasattr(score, "parts") and score.parts:
        return list(score.parts)
    if isinstance(score, stream.Part):
        return [score]

    part = stream.Part()
    for measure in score.getElementsByClass(stream.Measure):
        part.append(measure)
    if len(part):
        return [part]
    return [stream.Part(score)]


def _part_id(part: stream.Part, index: int) -> str:
    """Prefer MusicXML-style ids (P1, P2, …); fall back to a stable index id."""
    candidate = str(part.id) if part.id is not None else ""
    if candidate.startswith("P") and candidate[1:].isdigit():
        return candidate
    # music21 often sets .id to the part name; keep an index-based id instead.
    return f"P{index + 1}"


def _note_event(el: note.GeneralNote) -> NoteEvent:
    is_rest = bool(el.isRest)
    pitch: str | None = None
    if not is_rest and isinstance(el, note.Note):
        pitch = el.pitch.nameWithOctave
    elif not is_rest and isinstance(el, chord.Chord):
        pitch = "+".join(sorted(p.nameWithOctave for p in el.pitches))

    articulations = tuple(
        sorted(
            _articulation_name(a)
            for a in getattr(el, "articulations", [])
            if isinstance(a, Articulation)
        )
    )

    tie_type: str | None = None
    tie = getattr(el, "tie", None)
    if tie is not None:
        tie_type = str(tie.type)

    return NoteEvent(
        offset=float(el.offset),
        pitch=pitch,
        duration=float(el.quarterLength),
        is_rest=is_rest,
        articulations=articulations,
        tie=tie_type,
    )


def _articulation_name(art: Articulation) -> str:
    return art.classes[0] if art.classes else type(art).__name__
