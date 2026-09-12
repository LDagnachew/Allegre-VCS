"""Shared data shapes for parsed scores and diff output."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

# 48 steps per quarter supports 8th-note triplets and 16ths without float noise
# from MuseScore MusicXML round-trips.
TIME_STEPS = 48


def quantize_time(value: float) -> float:
    """Snap offsets/durations so tiny export jitter does not look like a change."""
    return round(float(value) * TIME_STEPS) / TIME_STEPS


ChangeType = Literal[
    "note_added",
    "note_removed",
    "note_changed",
    "articulation_added",
    "articulation_removed",
    "dynamic_added",
    "dynamic_removed",
    "dynamic_changed",
]


@dataclass(frozen=True)
class NoteEvent:
    """A note (or rest) at a measure offset, normalized for comparison."""

    offset: float
    pitch: str | None  # None for rests; MIDI-ish name like "C4"
    duration: float
    is_rest: bool
    articulations: tuple[str, ...] = ()
    tie: str | None = None  # "start" | "stop" | "continue" | None

    def identity_key(self) -> tuple[Any, ...]:
        """Key used to pair the same sounding note (ignores articulations/duration/tie)."""
        return (quantize_time(self.offset), self.pitch, self.is_rest)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class DynamicEvent:
    offset: float
    mark: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class MeasureSnapshot:
    number: int
    part_id: str
    notes: list[NoteEvent] = field(default_factory=list)
    dynamics: list[DynamicEvent] = field(default_factory=list)


@dataclass
class ScoreSnapshot:
    """Normalized score representation keyed for measure-level diffing."""

    parts: dict[str, dict[int, MeasureSnapshot]]
    # parts[part_id][measure_number] -> MeasureSnapshot


@dataclass
class MeasureChange:
    type: ChangeType
    detail: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {"type": self.type, "detail": self.detail}


@dataclass
class MeasureDiff:
    number: int
    part: str
    changes: list[MeasureChange] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "number": self.number,
            "part": self.part,
            "changes": [c.to_dict() for c in self.changes],
        }


@dataclass
class DiffSummary:
    additions: int = 0
    deletions: int = 0
    changes: int = 0

    def to_dict(self) -> dict[str, int]:
        return asdict(self)


@dataclass
class DiffResult:
    summary: DiffSummary
    measures: list[MeasureDiff] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "summary": self.summary.to_dict(),
            "measures": [m.to_dict() for m in self.measures],
        }
