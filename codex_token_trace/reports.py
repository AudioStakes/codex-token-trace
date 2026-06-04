from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

from .formatting import fmt_int, fmt_pct, shorten, table
from .models import Interval, SessionAnalysis, ToolCall


def _event_type_totals(analysis: SessionAnalysis) -> tuple[dict[str, int], dict[str, int], dict[str, int]]:
    totals: dict[str, int] = defaultdict(int)
    counts: dict[str, int] = defaultdict(int)
    maxes: dict[str, int] = defaultdict(int)
    for event in analysis.events:
        key = event.type_key
        totals[key] += event.raw_chars
        counts[key] += 1
        maxes[key] = max(maxes[key], event.raw_chars)
    return totals, counts, maxes


def _top_interval_event_types(interval: Interval, limit: int = 3, width: int = 80) -> str:
    parts = []
    for key, chars, count in interval.top_event_types(limit=limit):
        parts.append(f"{key}:{fmt_int(chars)}({count})")
    return shorten(", ".join(parts), width)


def session_summary(analysis: SessionAnalysis) -> str:
    final = analysis.final_total
    compacted_chars = sum(event.raw_chars for event in analysis.events if event.top_type == "compacted")
    compacted_count = sum(1 for event in analysis.events if event.top_type == "compacted")
    rows = [
        ("session", shorten(analysis.session_id, 72)),
        ("path", str(analysis.path)),
        ("events", fmt_int(len(analysis.events))),
        ("token events", f"{fmt_int(len(analysis.unique_token_events))} unique / {fmt_int(len(analysis.token_events))} raw"),
        ("total tokens", fmt_int(final.total_tokens)),
        ("input tokens", fmt_int(final.input_tokens)),
        ("cached input tokens", fmt_int(final.cached_input_tokens)),
        ("output tokens", fmt_int(final.output_tokens)),
        ("reasoning output tokens", fmt_int(final.reasoning_output_tokens)),
        ("max input per event", fmt_int(analysis.max_input_tokens)),
        ("max non-cached input", fmt_int(analysis.max_non_cached_input_tokens)),
        ("max context usage", fmt_pct(analysis.max_context_ratio)),
        ("session_meta chars", f"{fmt_int(analysis.session_meta_chars_total)} total / {fmt_int(analysis.session_meta_chars_max)} max / {fmt_int(analysis.session_meta_count)} events"),
        ("tool output chars", fmt_int(analysis.tool_output_chars)),
        ("exec command output chars", fmt_int(analysis.exec_command_output_chars)),
        ("compacted chars", f"{fmt_int(compacted_chars)} total / {fmt_int(compacted_count)} events"),
    ]
    return table(("metric", "value"), rows)


def sessions_table(analyses: list[SessionAnalysis], limit: int | None = None) -> str:
    rows = []
    sorted_sessions = sorted(analyses, key=lambda a: a.final_total.total_tokens, reverse=True)
    if limit:
        sorted_sessions = sorted_sessions[:limit]
    for a in sorted_sessions:
        rows.append((
            shorten(a.session_id, 48),
            fmt_int(a.final_total.total_tokens),
            fmt_int(a.final_total.input_tokens),
            fmt_int(a.final_total.cached_input_tokens),
            fmt_int(a.final_total.output_tokens),
            fmt_int(a.max_non_cached_input_tokens),
            fmt_pct(a.max_context_ratio),
            fmt_int(a.tool_output_chars),
        ))
    return table(
        ("session", "total", "input", "cached", "output", "max_new_input", "max_ctx", "tool_out_chars"),
        rows,
    )


def tool_output_table(tools: list[ToolCall], limit: int = 30, *, only_exec: bool = False) -> str:
    rows = []
    filtered = [tool for tool in tools if tool.output_chars > 0]
    if only_exec:
        filtered = [tool for tool in filtered if tool.name == "exec_command"]
    for c in sorted(filtered, key=lambda c: c.output_chars, reverse=True)[:limit]:
        rows.append((
            fmt_int(c.output_chars),
            c.output_events,
            c.display_name,
            shorten(c.display_command, 100),
        ))
    return table(("output_chars", "events", "tool", "command_or_input"), rows)


def aggregate_tool_output_table(analyses: list[SessionAnalysis], limit: int = 30, *, only_exec: bool = False) -> str:
    by_key: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: {"output": 0, "count": 0})
    for analysis in analyses:
        for c in analysis.tools:
            if c.output_chars <= 0:
                continue
            if only_exec and c.name != "exec_command":
                continue
            key = (c.display_name, c.display_command)
            by_key[key]["output"] += c.output_chars
            by_key[key]["count"] += 1

    rows = []
    for (tool, command), values in sorted(by_key.items(), key=lambda kv: kv[1]["output"], reverse=True)[:limit]:
        rows.append((fmt_int(values["output"]), values["count"], tool, shorten(command, 100)))
    return table(("output_chars", "calls", "tool", "command_or_input"), rows)


def timeline_table(analysis: SessionAnalysis, limit: int | None = None) -> str:
    rows = []
    events = analysis.unique_token_events
    if limit:
        events = events[:limit]
    for e in events:
        rows.append((
            e.line_no,
            e.timestamp or "-",
            fmt_int(e.last.input_tokens),
            fmt_int(e.last.cached_input_tokens),
            fmt_int(e.last.non_cached_input_tokens),
            fmt_int(e.last.output_tokens),
            fmt_int(e.last.reasoning_output_tokens),
            fmt_int(e.last.total_tokens),
            fmt_pct(e.context_ratio),
            fmt_pct(e.last.cache_hit_rate),
        ))
    return table(
        ("line", "time", "input", "cached", "new_input", "output", "reasoning", "total", "ctx", "cache"),
        rows,
    )


def interval_table(analysis: SessionAnalysis, limit: int = 30) -> str:
    intervals = sorted(
        analysis.intervals,
        key=lambda interval: interval.token_event.last.non_cached_input_tokens,
        reverse=True,
    )[:limit]
    rows = []
    for interval in intervals:
        token = interval.token_event
        top_tool = interval.tools[0] if interval.tools else None
        rows.append((
            token.line_no,
            token.timestamp or "-",
            fmt_int(token.last.non_cached_input_tokens),
            fmt_int(token.last.input_tokens),
            fmt_int(token.last.cached_input_tokens),
            fmt_int(interval.tool_output_chars),
            fmt_int(interval.exec_command_output_chars),
            fmt_int(interval.event_count),
            _top_interval_event_types(interval, limit=3, width=88),
            shorten(top_tool.display_command if top_tool else "", 80),
        ))
    return table(
        (
            "line",
            "time",
            "new_input",
            "input",
            "cached",
            "prev_tool_out",
            "prev_exec_out",
            "prev_events",
            "top_prev_event_types",
            "top_prev_tool_or_command",
        ),
        rows,
    )


def drivers_table(analysis: SessionAnalysis) -> str:
    totals, counts, maxes = _event_type_totals(analysis)
    rows = []
    for key, chars in sorted(totals.items(), key=lambda kv: kv[1], reverse=True):
        rows.append((fmt_int(chars), counts[key], fmt_int(maxes[key]), key))
    return table(("raw_chars", "events", "max_chars", "event_type"), rows)


def compaction_table(analysis: SessionAnalysis, limit: int = 20) -> str:
    rows = []
    events = [event for event in analysis.events if event.top_type == "compacted" or event.payload_type == "context_compacted"]
    for event in sorted(events, key=lambda e: e.raw_chars, reverse=True)[:limit]:
        rows.append((event.line_no, event.timestamp or "-", fmt_int(event.raw_chars), event.type_key))
    return table(("line", "time", "raw_chars", "event_type"), rows)


def session_to_dict(analysis: SessionAnalysis) -> dict[str, Any]:
    totals, counts, maxes = _event_type_totals(analysis)
    return {
        "session_id": analysis.session_id,
        "path": str(analysis.path),
        "events": len(analysis.events),
        "token_events": len(analysis.unique_token_events),
        "raw_token_events": len(analysis.token_events),
        "final_total": analysis.final_total.__dict__,
        "max_input_tokens": analysis.max_input_tokens,
        "max_non_cached_input_tokens": analysis.max_non_cached_input_tokens,
        "max_context_ratio": analysis.max_context_ratio,
        "session_meta": {
            "chars_total": analysis.session_meta_chars_total,
            "chars_max": analysis.session_meta_chars_max,
            "count": analysis.session_meta_count,
        },
        "tool_output_chars": analysis.tool_output_chars,
        "exec_command_output_chars": analysis.exec_command_output_chars,
        "drivers": [
            {"event_type": key, "raw_chars": totals[key], "events": counts[key], "max_chars": maxes[key]}
            for key in sorted(totals, key=lambda k: totals[k], reverse=True)
        ],
        "heaviest_tools": [
            {
                "tool": tool.display_name,
                "command_or_input": tool.display_command,
                "output_chars": tool.output_chars,
                "output_events": tool.output_events,
                "timestamp": tool.timestamp,
            }
            for tool in sorted([t for t in analysis.tools if t.output_chars > 0], key=lambda t: t.output_chars, reverse=True)[:50]
        ],
        "intervals": [
            {
                "line": interval.token_event.line_no,
                "timestamp": interval.token_event.timestamp,
                "new_input": interval.token_event.last.non_cached_input_tokens,
                "input": interval.token_event.last.input_tokens,
                "cached": interval.token_event.last.cached_input_tokens,
                "tool_output_chars": interval.tool_output_chars,
                "exec_command_output_chars": interval.exec_command_output_chars,
                "event_count": interval.event_count,
                "top_event_types": [
                    {"event_type": key, "raw_chars": chars, "events": count}
                    for key, chars, count in interval.top_event_types(limit=5)
                ],
                "top_tool": interval.tools[0].display_command if interval.tools else None,
            }
            for interval in sorted(analysis.intervals, key=lambda i: i.token_event.last.non_cached_input_tokens, reverse=True)[:50]
        ],
    }


def analyses_to_json(analyses: list[SessionAnalysis], *, session: SessionAnalysis | None = None) -> str:
    payload: dict[str, Any]
    if session is not None:
        payload = {"session": session_to_dict(session)}
    else:
        payload = {"sessions": [session_to_dict(a) for a in analyses]}
    return json.dumps(payload, ensure_ascii=False, indent=2)
