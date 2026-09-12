"""Tests for allegrevcs_diff."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from allegrevcs_diff.cli import main
from allegrevcs_diff.diff import diff_files, diff_scores
from allegrevcs_diff.models import MeasureSnapshot, NoteEvent, ScoreSnapshot
from allegrevcs_diff.parser import parse_score

FIXTURES = Path(__file__).parent / "fixtures"
BASELINE = FIXTURES / "baseline.musicxml"
MODIFIED = FIXTURES / "modified.musicxml"


def test_parse_baseline_has_three_measures() -> None:
    snap = parse_score(BASELINE)
    assert "P1" in snap.parts
    assert sorted(snap.parts["P1"].keys()) == [1, 2, 3]
    m1 = snap.parts["P1"][1]
    assert len(m1.notes) == 4
    assert m1.notes[0].pitch == "C4"
    assert m1.dynamics and m1.dynamics[0].mark == "p"


def test_identical_scores_produce_empty_diff() -> None:
    result = diff_files(BASELINE, BASELINE)
    assert result.summary.additions == 0
    assert result.summary.deletions == 0
    assert result.summary.changes == 0
    assert result.measures == []


def test_modified_score_detects_note_and_dynamic_changes() -> None:
    result = diff_files(BASELINE, MODIFIED)

    assert result.summary.additions >= 1
    assert result.summary.changes >= 1

    types_by_measure: dict[int, set[str]] = {}
    for m in result.measures:
        types_by_measure.setdefault(m.number, set()).update(c.type for c in m.changes)

    # Measure 1: E→G substitution, staccato on C, p→f dynamic
    assert 1 in types_by_measure
    assert "note_changed" in types_by_measure[1]
    assert "note_added" not in types_by_measure[1]
    assert "note_removed" not in types_by_measure[1]
    assert "articulation_added" in types_by_measure[1]
    assert "dynamic_changed" in types_by_measure[1]

    # Measure 2 unchanged
    assert 2 not in types_by_measure

    # Measure 3: rest replaced by two notes — additions only, not mixed with rest deletion
    assert 3 in types_by_measure
    assert "note_added" in types_by_measure[3]
    assert "note_removed" not in types_by_measure[3]


def test_diff_result_serializes_to_json() -> None:
    result = diff_files(BASELINE, MODIFIED)
    payload = result.to_dict()
    assert "summary" in payload
    assert "measures" in payload
    # Must be JSON-serializable
    json.dumps(payload)


def test_cli_prints_json(capsys: pytest.CaptureFixture[str]) -> None:
    code = main([str(BASELINE), str(MODIFIED)])
    assert code == 0
    out = capsys.readouterr().out
    payload = json.loads(out)
    assert payload["summary"]["additions"] >= 1


def test_cli_missing_file_returns_2(capsys: pytest.CaptureFixture[str]) -> None:
    code = main([str(BASELINE), str(FIXTURES / "does-not-exist.musicxml")])
    assert code == 2
    assert "error:" in capsys.readouterr().err


def test_diff_scores_roundtrip_via_parse() -> None:
    baseline = parse_score(BASELINE)
    modified = parse_score(MODIFIED)
    result = diff_scores(baseline, modified)
    assert any(m.number == 1 for m in result.measures)


def _measure_score(notes: list[NoteEvent]) -> ScoreSnapshot:
    return ScoreSnapshot(
        parts={"P1": {1: MeasureSnapshot(number=1, part_id="P1", notes=notes)}}
    )


def test_replacing_a_rest_with_a_note_is_an_addition() -> None:
    baseline = _measure_score(
        [
            NoteEvent(offset=0, pitch="C4", duration=1, is_rest=False),
            NoteEvent(offset=1, pitch=None, duration=1, is_rest=True),
            NoteEvent(offset=2, pitch="E4", duration=1, is_rest=False),
        ]
    )
    modified = _measure_score(
        [
            NoteEvent(offset=0, pitch="C4", duration=1, is_rest=False),
            NoteEvent(offset=1, pitch="D4", duration=1, is_rest=False),
            NoteEvent(offset=2, pitch="E4", duration=1, is_rest=False),
        ]
    )
    result = diff_scores(baseline, modified)
    types = [c.type for m in result.measures for c in m.changes]
    assert types == ["note_added"]
    assert result.summary.additions == 1
    assert result.summary.deletions == 0


def test_deleting_a_note_is_not_mixed_with_a_new_rest() -> None:
    baseline = _measure_score(
        [
            NoteEvent(offset=0, pitch="C4", duration=1, is_rest=False),
            NoteEvent(offset=1, pitch="D4", duration=1, is_rest=False),
        ]
    )
    modified = _measure_score(
        [
            NoteEvent(offset=0, pitch="C4", duration=1, is_rest=False),
            NoteEvent(offset=1, pitch=None, duration=1, is_rest=True),
        ]
    )
    result = diff_scores(baseline, modified)
    types = [c.type for m in result.measures for c in m.changes]
    assert types == ["note_removed"]
    assert result.summary.deletions == 1
    assert result.summary.additions == 0


def test_pitch_substitution_at_same_offset_is_changed_not_mixed() -> None:
    baseline = _measure_score(
        [NoteEvent(offset=0, pitch="C4", duration=1, is_rest=False)]
    )
    modified = _measure_score(
        [NoteEvent(offset=0, pitch="G4", duration=1, is_rest=False)]
    )
    result = diff_scores(baseline, modified)
    types = [c.type for m in result.measures for c in m.changes]
    assert types == ["note_changed"]
    assert result.summary.changes == 1
    assert result.summary.additions == 0
    assert result.summary.deletions == 0


def test_tiny_export_jitter_is_not_a_diff() -> None:
    baseline = _measure_score(
        [NoteEvent(offset=0.0, pitch="C4", duration=1.0, is_rest=False)]
    )
    modified = _measure_score(
        [NoteEvent(offset=0.0004, pitch="C4", duration=1.0002, is_rest=False)]
    )
    result = diff_scores(baseline, modified)
    assert result.measures == []
    assert result.summary.additions == 0
