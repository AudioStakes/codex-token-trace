from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Usage:
    input_tokens: int = 0
    cached_input_tokens: int = 0
    output_tokens: int = 0
    reasoning_output_tokens: int = 0
    total_tokens: int = 0

    @property
    def non_cached_input_tokens(self) -> int:
        return max(0, self.input_tokens - self.cached_input_tokens)

    @property
    def cache_hit_rate(self) -> float | None:
        if self.input_tokens <= 0:
            return None
        return self.cached_input_tokens / self.input_tokens


@dataclass
class Event:
    line_no: int
    timestamp: str | None
    top_type: str | None
    payload_type: str | None
    raw_chars: int
    raw: dict[str, Any]

    @property
    def type_key(self) -> str:
        return f"{self.top_type or 'unknown'}/{self.payload_type or 'no_payload_type'}"


@dataclass
class TokenEvent(Event):
    last: Usage = field(default_factory=Usage)
    total: Usage = field(default_factory=Usage)
    context_window: int | None = None
    duplicate_total: bool = False

    @property
    def context_ratio(self) -> float | None:
        if not self.context_window or self.context_window <= 0:
            return None
        return self.last.input_tokens / self.context_window


@dataclass
class ToolCall:
    call_id: str
    timestamp: str | None
    name: str | None
    command: str
    arguments_chars: int
    call_type: str = "function_call"
    input_preview: str = ""
    input_chars: int = 0
    output_chars: int = 0
    output_events: int = 0

    @property
    def display_name(self) -> str:
        return self.name or self.call_type or "tool"

    @property
    def display_input(self) -> str:
        return self.command or self.input_preview or "-"

    @property
    def is_exec_command(self) -> bool:
        return self.name == "exec_command"


@dataclass
class Interval:
    previous_token_line: int | None
    token_event: TokenEvent
    event_count: int
    raw_chars_by_type: dict[str, int]
    count_by_type: dict[str, int]
    tools: list[ToolCall]

    @property
    def tool_output_chars(self) -> int:
        return sum(tool.output_chars for tool in self.tools)

    @property
    def exec_command_output_chars(self) -> int:
        return sum(tool.output_chars for tool in self.tools if tool.is_exec_command)

    def top_event_types(self, limit: int = 3) -> list[tuple[str, int, int]]:
        rows = [
            (key, chars, self.count_by_type.get(key, 0))
            for key, chars in self.raw_chars_by_type.items()
        ]
        return sorted(rows, key=lambda row: row[1], reverse=True)[:limit]


@dataclass
class SessionAnalysis:
    path: Path
    events: list[Event]
    token_events: list[TokenEvent]
    unique_token_events: list[TokenEvent]
    tools: list[ToolCall]
    intervals: list[Interval]
    session_meta_chars_total: int = 0
    session_meta_chars_max: int = 0
    session_meta_count: int = 0

    @property
    def session_id(self) -> str:
        return self.path.stem

    @property
    def final_total(self) -> Usage:
        if self.unique_token_events:
            return self.unique_token_events[-1].total
        return Usage()

    @property
    def max_context_ratio(self) -> float | None:
        ratios = [e.context_ratio for e in self.unique_token_events if e.context_ratio is not None]
        return max(ratios) if ratios else None

    @property
    def max_input_tokens(self) -> int:
        return max((e.last.input_tokens for e in self.unique_token_events), default=0)

    @property
    def max_non_cached_input_tokens(self) -> int:
        return max((e.last.non_cached_input_tokens for e in self.unique_token_events), default=0)

    @property
    def tool_output_chars(self) -> int:
        return sum(tool.output_chars for tool in self.tools)

    @property
    def exec_command_output_chars(self) -> int:
        return sum(tool.output_chars for tool in self.tools if tool.is_exec_command)
