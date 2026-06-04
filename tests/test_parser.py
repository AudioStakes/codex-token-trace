from __future__ import annotations

import json
from pathlib import Path

from codex_token_trace.parser import parse_session_file


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")


def token(total: int, input_tokens: int, cached: int, line_time: str = "2026-01-01T00:00:00Z"):
    return {
        "timestamp": line_time,
        "type": "event_msg",
        "payload": {
            "type": "token_count",
            "info": {
                "total_token_usage": {
                    "input_tokens": total,
                    "cached_input_tokens": cached,
                    "output_tokens": 10,
                    "reasoning_output_tokens": 2,
                    "total_tokens": total + 10,
                },
                "last_token_usage": {
                    "input_tokens": input_tokens,
                    "cached_input_tokens": cached,
                    "output_tokens": 10,
                    "reasoning_output_tokens": 2,
                    "total_tokens": input_tokens + 10,
                },
                "model_context_window": 1000,
            },
        },
    }


def test_parse_tools_and_deduplicate_token_events(tmp_path: Path) -> None:
    path = tmp_path / "session.jsonl"
    write_jsonl(
        path,
        [
            {"timestamp": "t0", "type": "session_meta", "cwd": "/repo"},
            token(100, 100, 20, "t1"),
            {
                "timestamp": "t2",
                "type": "response_item",
                "payload": {
                    "type": "function_call",
                    "call_id": "call_1",
                    "name": "exec_command",
                    "arguments": json.dumps({"cmd": "sed -n '1,220p' README.md"}),
                },
            },
            {
                "timestamp": "t3",
                "type": "response_item",
                "payload": {"type": "function_call_output", "call_id": "call_1", "output": "x" * 500},
            },
            {"timestamp": "t3c", "type": "compacted", "items": ["x" * 20]},
            token(800, 700, 400, "t4"),
            token(800, 700, 400, "t5"),
        ],
    )
    analysis = parse_session_file(path)
    assert len(analysis.token_events) == 3
    assert len(analysis.unique_token_events) == 2
    assert analysis.final_total.total_tokens == 810
    assert analysis.max_non_cached_input_tokens == 300
    assert analysis.tools[0].command == "sed -n '1,220p' README.md"
    assert analysis.tools[0].output_chars == 500
    assert analysis.exec_command_output_chars == 500
    assert analysis.session_meta_chars_total > 0
    assert analysis.session_meta_count == 1
    assert any("compacted" in key for key in analysis.intervals[-1].raw_chars_by_type)


def test_custom_tool_output_is_counted(tmp_path: Path) -> None:
    path = tmp_path / "session.jsonl"
    write_jsonl(
        path,
        [
            {
                "timestamp": "t1",
                "type": "response_item",
                "payload": {
                    "type": "custom_tool_call",
                    "call_id": "img_1",
                    "name": "view_image",
                    "input": {"path": "/tmp/a.png"},
                },
            },
            {
                "timestamp": "t2",
                "type": "response_item",
                "payload": {"type": "custom_tool_call_output", "call_id": "img_1", "output": "i" * 1000},
            },
            token(1200, 1200, 200, "t3"),
        ],
    )
    analysis = parse_session_file(path)
    assert analysis.tools[0].display_name == "view_image"
    assert analysis.tools[0].output_chars == 1000
    assert analysis.tool_output_chars == 1000
