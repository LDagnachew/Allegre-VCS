#!/usr/bin/env bash
# Build a standalone allegrevcs-diff binary for bundling in the Electron app.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$ENGINE_ROOT/../.." && pwd)"
OUTPUT_DIR="$REPO_ROOT/apps/desktop/resources/diff-engine"
VENV="$ENGINE_ROOT/.venv"
DIST_DIR="$ENGINE_ROOT/.pyinstaller-dist"
WORK_DIR="$ENGINE_ROOT/.pyinstaller-build"

if [[ ! -x "$VENV/bin/python" ]]; then
  echo "Diff engine venv not found. Run:" >&2
  echo "  cd packages/diff-engine && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'" >&2
  exit 1
fi

echo "Installing PyInstaller (if needed)…"
"$VENV/bin/pip" install -q 'pyinstaller>=6.0'

echo "Building standalone diff engine…"
rm -rf "$DIST_DIR" "$WORK_DIR"
mkdir -p "$WORK_DIR" "$DIST_DIR"
export PYINSTALLER_CONFIG_DIR="$WORK_DIR/pyinstaller-config"
export MPLCONFIGDIR="$WORK_DIR/matplotlib-config"
"$VENV/bin/pyinstaller" \
  --noconfirm \
  --clean \
  --distpath "$DIST_DIR" \
  --workpath "$WORK_DIR" \
  "$ENGINE_ROOT/allegrevcs-diff.spec"

BIN_NAME="allegrevcs-diff"
if [[ "$(uname -s)" == MINGW* ]] || [[ "$(uname -s)" == MSYS* ]] || [[ "$(uname -s)" == CYGWIN* ]]; then
  BIN_NAME="allegrevcs-diff.exe"
fi

BUILT="$DIST_DIR/$BIN_NAME"
if [[ ! -f "$BUILT" ]]; then
  echo "Expected binary not found: $BUILT" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
cp "$BUILT" "$OUTPUT_DIR/$BIN_NAME"
chmod +x "$OUTPUT_DIR/$BIN_NAME"

echo "Bundled diff engine -> $OUTPUT_DIR/$BIN_NAME"
ls -lh "$OUTPUT_DIR/$BIN_NAME"
