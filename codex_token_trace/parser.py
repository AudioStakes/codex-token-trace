from __future__ import annotations

import glob
import json
import shlex
from pathlib import Path
from typing import Any, Iterable

from .models import Event, Interval, SessionAnalysis, TokenEvent, ToolCall, Usage


CALL_TYPES = {"function_call", "custom_tool_call", "web_search_call"}
OUTPUT_TYPES = {"function_call_output", "custom_tool_call_output", "web_search_end"}


def _payload_type(obj: dict[str, Any]) -> str | None:
    payload = obj.get("payload")
    if isinstance(payload, dict):
        return payload.get("type")
    return None


def _usage(data: dict[str, Any] | None) -> Usage:
    if not isinstance(data, dict):
        return Usage()
    return Usage(
        input_tokens=int(data.get("input_tokens") or 0),
        cached_input_tokens=int(data.get("cached_input_tokens") or 0),
        output_tokens=int(data.get("output_tokens") or 0),
        reasoning_output_tokens=int(data.get("reasoning_output_tokens") or 0),
        total_tokens=int(data.get("total_tokens") or 0),
    )


def _json_len(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, str):
        return len(value)
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")))


def _decode_command(arguments: Any) -> tuple[str, int]:
    if arguments is None:
        return "", 0
    if isinstance(arguments, str):
        arg_chars = len(arguments)
        try:
            decoded = json.loads(arguments)
        except json.JSONDecodeError:
            return arguments, arg_chars
    else:
        decoded = arguments
        arg_chars = _json_len(arguments)

    if isinstance(decoded, dict):
        cmd = decoded.get("cmd") or decoded.get("command") or decoded.get("input") or decoded.get("path") or ""
        if isinstance(cmd, list):
            return shlex.join(str(part) for part in cmd), arg_chars
        return str(cmd), arg_chars
    return str(decoded), arg_chars


def _call_id(payload: dict[str, Any]) -> str | None:
    value = payload.get("call_id") or payload.get("id")
    return str(value) if value else None


def _tool_name(payload: dict[str, Any], fallback: str | None) -> str | None:
    value = payload.get("name") or payload.get("tool_name") or payload.get("tool")
    return str(value) if value else fallback


def _output_chars(payload: dict[str, Any]) -> int:
    for key in ("output", "result", "content", "text"):
        if key in payload:
            return _json_len(payload.get(key))
    return _json_len(payload)


def parse_session_file(path: Path) -> SessionAnalysis:
    events: list[Event] = []
    token_events: list[TokenEvent] = []
    tool_by_id: dict[str, ToolCall] = {}
    session_meta_chars_total = 0
    session_meta_chars_max = 0
    session_meta_count = 0
    previous_total_tokens: int | None = None

    with path.open("r", encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, start=1):
            line = line.rstrip("\n")
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue

            raw_chars = len(line)
            top_type = obj.get("type")
            ptype = _payload_type(obj)
            event = Event(
                line_no=line_no,
                timestamp=obj.get("timestamp"),
                top_type=top_type,
                payload_type=ptype,
                raw_chars=raw_chars,
                raw=obj,
            )
            events.append(event)

            if top_type == "session_meta":
                session_meta_count += 1
                session_meta_chars_total += raw_chars
                session_meta_chars_max = max(session_meta_chars_max, raw_chars)

            payload = obj.get("payload") if isinstance(obj.get("payload"), dict) else {}
            if ptype in CALL_TYPES:
                call_id = _call_id(payload)
                if call_id:
                    command, arg_chars = _decode_command(payload.get("arguments") or payload.get("input"))
                    tool_by_id[call_id] = ToolCall(
                        call_id=call_id,
                        timestamp=obj.get("timestamp"),
                        name=_tool_name(payload, ptype),
                        command=command,
                        arguments_chars=arg_chars,
                        call_type=ptype or "tool_call",
                    )
            elif ptype in OUTPUT_TYPES:
                call_id = _call_id(payload)
                if call_id:
                    tool = tool_by_id.get(call_id)
                    if tool is None:
                        tool = ToolCall(
                            call_id=call_id,
                            timestamp=obj.get("timestamp"),
                            name=_tool_name(payload, ptype),
                            command="",
                            arguments_chars=0,
                            call_type=ptype or "tool_output",
                        )
                        tool_by_id[call_id] = tool
                    tool.output_chars += _output_chars(payload)
                    tool.output_events += 1
            elif ptype == "token_count":
                info = payload.get("info")
                if isinstance(info, dict):
                    total = _usage(info.get("total_token_usage"))
                    duplicate = previous_total_tokens == total.total_tokens
                    previous_total_tokens = total.total_tokens
                    token = TokenEvent(
                        line_no=line_no,
                        timestamp=obj.get("timestamp"),
                        top_type=top_type,
                        payload_type=ptype,
                        raw_chars=raw_chars,
                        raw=obj,
                        last=_usage(info.get("last_token_usage")),
                        total=total,
                        context_window=info.get("model_context_window"),
                        duplicate_total=duplicate,
                    )
                    token_events.append(token)

    tools = sorted(tool_by_id.values(), key=lambda c: c.output_chars, reverse=True)
    intervals = _build_intervals(events, token_events, tool_by_id)
    unique_token_events = [e for e in token_events if not e.duplicate_total]

    return SessionAnalysis(
        path=path,
        events=events,
        token_events=token_events,
        unique_token_events=unique_token_events,
        tools=tools,
        intervals=intervals,
        session_meta_chars_total=session_meta_chars_total,
        session_meta_chars_max=session_meta_chars_max,
        session_meta_count=session_meta_count,
    )


def _build_intervals(events: list[Event], token_events: list[TokenEvent], tool_by_id: dict[str, ToolCall]) -> list[Interval]:
    by_line = {event.line_no: event for event in events}
    intervals: list[Interval] = []
    previous_line: int | None = None

    for token in token_events:
        if token.duplicate_total:
            previous_line = token.line_no
            continue
        start = (previous_line or 0) + 1
        end = token.line_no - 1
        between = [by_line[i] for i in range(start, end + 1) if i in by_line]
        raw_chars_by_type: dict[str, int] = {}
        count_by_type: dict[str, int] = {}
        call_ids: set[str] = set()

        for event in between:
            key = event.type_key
            raw_chars_by_type[key] = raw_chars_by_type.get(key, 0) + event.raw_chars
            count_by_type[key] = count_by_type.get(key, 0) + 1
            payload = event.raw.get("payload")
            if isinstance(payload, dict):
                call_id = _call_id(payload)
                if call_id:
                    call_ids.add(call_id)

        tools = [tool_by_id[cid] for cid in call_ids if cid in tool_by_id]
        tools.sort(key=lambda c: c.output_chars, reverse=True)
        intervals.append(
            Interval(
                previous_token_line=previous_line,
                token_event=token,
                event_count=len(between),
                raw_chars_by_type=raw_chars_by_type,
                count_by_type=count_by_type,
                tools=tools,
            )
        )
        previous_line = token.line_no

    return intervals


def discover_files(paths: Iterable[str]) -> list[Path]:
    files: list[Path] = []
    for raw in paths:
        p = Path(raw).expanduser()
        if any(ch in raw for ch in "*?["):
            files.extend(Path(match) for match in glob.glob(str(p), recursive=True))
        elif p.is_dir():
            files.extend(p.rglob("*.jsonl"))
        elif p.is_file():
            files.append(p)
    return sorted(set(files))
