# allegrevcs-diff

Phase 0 diff engine for AllegreVCS. Compares two MusicXML files and emits a structured, measure-level JSON diff.

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
```

## Usage

```bash
.venv/bin/allegrevcs-diff path/to/a.musicxml path/to/b.musicxml
```

## Tests

```bash
.venv/bin/pytest
```
