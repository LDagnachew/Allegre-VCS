# AllegreVCS

Version control for MuseScore composers. Diffs, commits, and version history for `.mscz` files — without changing how composers actually work in MuseScore.

## What this is

A desktop app that sits alongside MuseScore. Composers keep composing entirely inside MuseScore as normal. AllegreVCS watches their `.mscz` file, and when they click **Commit**, it converts the current state to MusicXML via MuseScore's headless CLI, diffs it against the last committed version, and stores a new version — visually diffable, restorable, and browsable through a timeline.

This README describes the **Phase 0 + Phase 1 MVP scope only**: a single-user, local-only version history tool. No branching, no accounts, no sync, no live collaboration — those are explicitly out of scope for this build and come in later phases.

## Why this exists

- Desktop notation software (MuseScore, Sibelius, Finale, Dorico) has no meaningful diffing or version history — composers resort to files named `MyScore1`, `MyScore2`, `MyScore_final_v3`.
- MuseScore's own community has requested this for years; a formal GitHub feature request for real-time collaboration was explicitly closed as "not planned" by the core team.
- MuseScore is the right first target: it's open source, and it ships a genuine **headless CLI conversion mode** (`mscore -o output.musicxml input.mscz`), which makes a fully automated, silent "Commit" action possible with zero UI automation. Sibelius/Finale/Dorico only expose GUI-driven batch export, so they're out of scope for this build.

## Non-goals for this build

Do **not** implement in this phase:
- Branching or merging (Phase 2)
- Cloud sync, accounts, or multi-user anything (Phase 3)
- Real-time/live collaborative editing (a separate future product direction, not this tool)
- Support for Sibelius, Finale, or Dorico (MuseScore-only for now)
- Reading MuseScore's native `.mscx`/`.mscz` XML directly — MuseScore's team has explicitly stated this format is undocumented, internal-only, and breaks across versions. Always go through MusicXML via the official CLI converter.

## Core user flow (what the app must support end to end)

1. **Setup** — user points the app at a folder containing a `.mscz` file; app locates the local MuseScore CLI executable (prompt for path on first run if not auto-detected)
2. **Change detection** — app compares the `.mscz` file's mtime/content-hash against what was recorded at the last commit. If different, enable the Commit action. Do not attempt to read MuseScore's in-app "unsaved changes" indicator — it's unreliable to access externally. Show a static reminder instead: "Save your score in MuseScore before committing."
3. **Commit** — on user action:
   - Shell out to `mscore -o <temp>.musicxml <file>.mscz`
   - Parse the resulting MusicXML
   - Diff against the previously committed snapshot (measure-level: notes added/removed/changed, articulations, dynamics)
   - Show a summary (e.g. "14 additions, 2 deletions") and an optional commit-message field
   - On confirm: store the new MusicXML as a content-addressed blob, write commit metadata (message, timestamp, blob hash, parent commit hash) to the local database
4. **History / timeline** — list all commits in order; selecting one renders it via Verovio
5. **Diff view** — select any two commits; render both, highlight changed measures visually on the score (not raw XML text)
6. **Restore** — select a past commit; either overwrite the working `.mscz` (via `mscore -o <file>.mscz <version>.musicxml`) or export as a new file, non-destructively

## Known limitations

- **Restore is lossy.** Everything AllegreVCS stores is MusicXML, not the native `.mscz`. MusicXML doesn't capture all of MuseScore's internal state (custom layout tweaks, some style/engraving settings), so a restored file will be musically identical to what was committed but may not look pixel-identical to what was last open in MuseScore.
- **MuseScore version matters.** `mscore -o` is the MuseScore 3 CLI invocation. MuseScore 4 renamed the executable per platform and headless conversion on Linux requires a virtual display (Xvfb). The CLI bridge (`apps/desktop/src/main/cli-bridge`) needs to account for this when locating the executable.

## Tech stack

| Layer | Choice |
|---|---|
| App shell / UI | Electron + React + TypeScript |
| Diff engine | Python, using `music21` for MusicXML parsing, run as a local subprocess |
| Score rendering | Verovio (WASM) — renders MusicXML to SVG |
| Storage | SQLite for commit metadata + filesystem content-addressed blob store for MusicXML snapshots |
| CLI bridge | Node `child_process`, wraps `mscore -o` calls |
| File watching | `chokidar`, polling `.mscz` mtime/hash |
| Packaging | `electron-builder` |

## Repo structure

```
.
├── apps/
│   └── desktop/                 # Electron + React app
│       ├── src/
│       │   ├── main/            # Electron main process
│       │   │   ├── cli-bridge/  # wraps mscore CLI calls
│       │   │   ├── watcher/     # file change detection
│       │   │   ├── vault/       # commit metadata + blob store access
│       │   │   └── diff-runner/ # spawns the Python diff engine, parses its output
│       │   ├── renderer/        # React UI
│       │   │   ├── components/  # Timeline, DiffView, CommitPanel
│       │   │   └── verovio/     # score rendering wrapper
│       │   └── shared/          # types shared between main/renderer
├── packages/
│   └── diff-engine/             # Python package
│       ├── allegrevcs_diff/
│       │   ├── parser.py        # music21-based MusicXML parsing
│       │   ├── diff.py          # measure-level diff logic
│       │   └── cli.py           # CLI entrypoint: two files in, structured JSON diff out
│       └── tests/
├── docs/
│   └── data-model.md            # commit/blob schema
└── README.md
```

## Data model (v1, local only)

- **Blob**: content-addressed (hash of MusicXML content), stored as a file in a local blob directory. Immutable.
- **Commit**: `{ id, message, timestamp, blob_hash, parent_commit_id | null }` — stored in SQLite. `parent_commit_id` is nullable now but designed so Phase 2 can add a second parent field for merge commits without a schema rewrite.
- **Project**: `{ id, name, mscz_path, last_known_hash }` — tracks which `.mscz` file this project watches and its state at last commit, used for change detection.

See [docs/data-model.md](docs/data-model.md) for the SQLite schema sketch.

## Build order (do not skip ahead)

1. **Phase 0**: Build `packages/diff-engine` as a standalone CLI first. Input: two MusicXML file paths. Output: structured JSON diff (measure-level changes). No UI, no Electron, no MuseScore CLI integration yet — just prove the diff algorithm works against sample MusicXML files.
2. **Phase 1**: Build the Electron shell around it — CLI bridge, file watcher, vault storage, commit flow, timeline UI, Verovio rendering, restore flow — using the diff engine from Phase 0 as a subprocess dependency.

Do not begin branching/merge, sync, accounts, or any multi-user logic. That's explicitly future work and building toward it now will over-scope this pass.

## Getting started

- [x] `packages/diff-engine` — Python project setup, `music21` dependency, parser/diff/CLI with passing tests against sample MusicXML fixtures
- [x] `apps/desktop` — Electron + React + TypeScript scaffold
- [x] CLI bridge module — locate MuseScore executable per OS, wrap `-o` conversion call
- [x] SQLite schema + blob store read/write
- [x] Basic Commit → Diff → Timeline UI loop (Open → Commit → Timeline → Diff → Restore)

### Running the diff engine

```bash
cd packages/diff-engine
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/pytest
.venv/bin/allegrevcs-diff tests/fixtures/baseline.musicxml tests/fixtures/modified.musicxml
```

### Running the desktop app

```bash
cd apps/desktop
npm install
npm run dev
```

Last opened score is restored on launch.

### Packaging (macOS)

```bash
cd apps/desktop
npm run dist:mac
```

This bundles the Python diff engine via PyInstaller, then builds a `.dmg` in `apps/desktop/release/`. End users need MuseScore installed; they do not need Python or this repo checkout.
