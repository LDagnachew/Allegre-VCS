"""CLI entrypoint: two MusicXML paths in, structured JSON diff out."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from allegrevcs_diff.diff import diff_files


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="allegrevcs-diff",
        description=(
            "Compare two MusicXML files and print a measure-level JSON diff."
        ),
    )
    parser.add_argument("baseline", type=Path, help="Baseline MusicXML file")
    parser.add_argument("modified", type=Path, help="Modified MusicXML file")
    parser.add_argument(
        "--indent",
        type=int,
        default=2,
        help="JSON indent level (default: 2; use 0 for compact)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        result = diff_files(args.baseline, args.modified)
    except FileNotFoundError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001 — surface parse failures cleanly
        print(f"error: failed to diff scores: {exc}", file=sys.stderr)
        return 1

    indent = None if args.indent == 0 else args.indent
    json.dump(result.to_dict(), sys.stdout, indent=indent)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
