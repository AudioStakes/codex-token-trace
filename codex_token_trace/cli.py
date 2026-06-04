from __future__ import annotations

import argparse
from pathlib import Path

from .parser import discover_files, parse_session_file
from .reports import (
    aggregate_tool_output_table,
    analyses_to_json,
    compaction_table,
    drivers_table,
    interval_table,
    session_summary,
    sessions_table,
    timeline_table,
    tool_output_table,
)


def _default_paths() -> list[str]:
    return [str(Path.home() / ".codex" / "sessions")]


def _load(paths: list[str]):
    files = discover_files(paths or _default_paths())
    if not files:
        raise SystemExit("No .jsonl files found. Pass a session file, directory, or glob pattern.")
    analyses = []
    for file in files:
        analysis = parse_session_file(file)
        if analysis.events:
            analyses.append(analysis)
    if not analyses:
        raise SystemExit("No readable Codex session events found.")
    return analyses


def _pick_session(analyses, session: str | None):
    if session:
        matches = [a for a in analyses if session in a.session_id or session in str(a.path)]
        if not matches:
            raise SystemExit(f"No session matched: {session}")
        return matches[0]
    return max(analyses, key=lambda a: a.final_total.total_tokens)


def cmd_analyze(args: argparse.Namespace) -> int:
    analyses = _load(args.paths)
    analysis = _pick_session(analyses, args.session)
    if args.json:
        print(analyses_to_json(analyses, session=analysis))
        return 0

    print("# Session summary")
    print(session_summary(analysis))
    print()
    print("# Likely token drivers by raw JSON size")
    print(drivers_table(analysis))
    print()
    print(f"# Compaction events (top {args.limit})")
    print(compaction_table(analysis, limit=args.limit))
    print()
    print(f"# Heaviest tool outputs (top {args.limit})")
    print(tool_output_table(analysis.tools, limit=args.limit))
    print()
    print(f"# Heaviest exec command outputs (top {args.limit})")
    print(tool_output_table(analysis.tools, limit=args.limit, only_exec=True))
    print()
    print(f"# Non-cached input spikes (top {args.limit})")
    print(interval_table(analysis, limit=args.limit))
    return 0


def cmd_sessions(args: argparse.Namespace) -> int:
    analyses = _load(args.paths)
    if args.json:
        print(analyses_to_json(analyses))
        return 0
    print(sessions_table(analyses, limit=args.limit))
    return 0


def cmd_tools(args: argparse.Namespace) -> int:
    analyses = _load(args.paths)
    if args.session:
        analysis = _pick_session(analyses, args.session)
        print(tool_output_table(analysis.tools, limit=args.limit, only_exec=args.exec_only))
    else:
        print(aggregate_tool_output_table(analyses, limit=args.limit, only_exec=args.exec_only))
    return 0


def cmd_timeline(args: argparse.Namespace) -> int:
    analyses = _load(args.paths)
    analysis = _pick_session(analyses, args.session)
    print(timeline_table(analysis, limit=args.limit))
    return 0


def cmd_intervals(args: argparse.Namespace) -> int:
    analyses = _load(args.paths)
    analysis = _pick_session(analyses, args.session)
    print(interval_table(analysis, limit=args.limit))
    return 0


def cmd_compactions(args: argparse.Namespace) -> int:
    analyses = _load(args.paths)
    analysis = _pick_session(analyses, args.session)
    print(compaction_table(analysis, limit=args.limit))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="codex-token-trace",
        description="Trace what drives Codex token usage from local session JSONL logs.",
    )
    parser.add_argument("--version", action="version", version="codex-token-trace 0.2.0")
    sub = parser.add_subparsers(dest="command")

    def add_common(p: argparse.ArgumentParser) -> None:
        p.add_argument(
            "paths",
            nargs="*",
            help="Codex session .jsonl files, directories, or glob patterns. Defaults to ~/.codex/sessions.",
        )
        p.add_argument("--session", help="Substring of session id/path to analyze. Defaults to the highest-token session.")
        p.add_argument("--limit", type=int, default=30, help="Number of rows to show.")

    p = sub.add_parser("analyze", help="Show summary, drivers, compactions, heavy tool outputs, and input spikes.")
    add_common(p)
    p.add_argument("--json", action="store_true", help="Print machine-readable JSON instead of tables.")
    p.set_defaults(func=cmd_analyze)

    p = sub.add_parser("sessions", help="List sessions sorted by total tokens.")
    p.add_argument("paths", nargs="*", help="Session files, directories, or glob patterns. Defaults to ~/.codex/sessions.")
    p.add_argument("--limit", type=int, default=50, help="Number of sessions to show.")
    p.add_argument("--json", action="store_true", help="Print machine-readable JSON instead of tables.")
    p.set_defaults(func=cmd_sessions)

    p = sub.add_parser("tools", aliases=["commands"], help="Show heaviest tool outputs. Use --exec-only for shell commands only.")
    add_common(p)
    p.add_argument("--exec-only", action="store_true", help="Only show exec_command outputs.")
    p.set_defaults(func=cmd_tools)

    p = sub.add_parser("timeline", help="Show token_count timeline for a session.")
    add_common(p)
    p.set_defaults(func=cmd_timeline)

    p = sub.add_parser("intervals", help="Show intervals sorted by non-cached input tokens.")
    add_common(p)
    p.set_defaults(func=cmd_intervals)

    p = sub.add_parser("compactions", help="Show context compaction events for a session.")
    add_common(p)
    p.set_defaults(func=cmd_compactions)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not hasattr(args, "func"):
        args = parser.parse_args(["analyze"] + (argv or []))
    try:
        return args.func(args)
    except BrokenPipeError:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
