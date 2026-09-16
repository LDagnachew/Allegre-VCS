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
5. **Restore & commit…** — roll back the working file and record it in history, or **Restore without committing** / **Export this version…** (overwrite asks for confirmation; restore is musically accurate but layout may change)
6. **Scrub history** — drag the slider, use ← →, or press Play to step through commits oldest → newest
7. **Clear history…** — wipe this score’s AllegreVCS commits (score file on disk stays)
8. **Esc** exits compare mode

MuseScore 4 on macOS is auto-detected at  
`/Applications/MuseScore 4.app/Contents/MacOS/mscore`.

## Installer (macOS)

Builds the diff engine into a standalone binary, then packages the Electron app:

```bash
cd apps/desktop
npm run dist:mac
```

The `.dmg` lands in `apps/desktop/release/`. The packaged app includes the bundled diff engine — no Python install or repo checkout required on the target machine. MuseScore must still be installed separately for `.mscz` conversion. The app icon lives in `apps/desktop/build/` (`icon.png` / `icon.icns`).

To rebuild only the diff engine binary:

```bash
npm run bundle:diff-engine
```
