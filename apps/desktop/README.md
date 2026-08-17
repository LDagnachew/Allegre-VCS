# AllegreVCS Desktop

Electron + React shell for Phase 1: local MuseScore version history.

## Develop

From repo root, ensure the diff engine venv exists:

```bash
cd packages/diff-engine
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
```

Then:

```bash
cd apps/desktop
npm install
npm run dev
```

The last opened score is restored on launch. If MuseScore isn’t auto-detected, use **Locate MuseScore…** in the top bar.

## Flow

1. **Open score…** — pick a `.mscz` (or `.musicxml` for local testing without MuseScore conversion). Each score path gets its own timeline; switching scores restores that score’s history.
2. Edit & save in MuseScore (watcher detects hash change)
3. **Preview diff** (shows conversion progress) → optional message → **Commit**
4. Browse **Timeline**, compare two commits, render via Verovio (changed measures highlight on the score)
5. **Restore** overwrite or export

MuseScore 4 on macOS is auto-detected at  
`/Applications/MuseScore 4.app/Contents/MacOS/mscore`.

## Installer (macOS)

```bash
cd apps/desktop
npm run dist:mac
```

The `.dmg` lands in `apps/desktop/release/`. The packaged app still uses the repo’s Python diff engine (`packages/diff-engine/.venv`) when you run from this checkout; a fully self-contained Python bundle is later work.
