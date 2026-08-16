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

## Flow

1. **Open score…** — pick a `.mscz` (or `.musicxml` for local testing without MuseScore conversion)
2. Edit & save in MuseScore (watcher detects hash change)
3. **Preview diff** → optional message → **Commit**
4. Browse **Timeline**, compare two commits, render via Verovio
5. **Restore** overwrite or export

MuseScore 4 on macOS is auto-detected at  
`/Applications/MuseScore 4.app/Contents/MacOS/mscore`.
