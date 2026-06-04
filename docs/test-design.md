# codex-token-trace Test Design

## Purpose

This document defines the initial automated test strategy for `codex-token-trace`.

`codex-token-trace` analyzes local Codex session JSONL files and reports:

- official token usage from `token_count` events
- when token usage happened
- cached vs non-cached input tokens
- context window usage
- likely token drivers from surrounding events
- heavy tool outputs
- compaction events
- large message/tool/patch events

The primary testing goal is to protect the correctness of token usage extraction and cause-analysis heuristics.

## Test scope

The initial test suite should prioritize unit tests for:

1. `parser`
2. `models`
3. `reports`

CLI-level smoke tests should be added after the parser/reporting behavior is stable.

## Core principles

- Official token counts come from Codex `token_count` events.
- Estimated driver information comes from surrounding event sizes.
- Official token usage and heuristic attribution must not be mixed.
- Duplicate `token_count` events must not inflate session totals.
- Tests should use small artificial JSONL fixtures, not large real Codex logs.

## Highest-priority test areas

### 1. `token_count` extraction

Verify that token usage is extracted correctly from Codex `token_count` events.

Test cases:

1. `payload.type == "token_count"` with `info != null` is parsed as a token event.
2. `payload.type == "token_count"` with `info == null` is ignored for usage totals.
3. `last_token_usage` is parsed as event-level usage.
4. `total_token_usage` is parsed as session cumulative usage.
5. `model_context_window` is parsed when present.

Expected fields:

- `input_tokens`
- `cached_input_tokens`
- `output_tokens`
- `reasoning_output_tokens`
- `total_tokens`
- `model_context_window`

### 2. Duplicate `token_count` handling

Codex may emit repeated `token_count` events with the same `total_token_usage.total_tokens`.

Test cases:

1. Repeated `total_tokens` is marked as duplicate.
2. Duplicate token events are excluded from `unique_token_events`.
3. Raw token event count and unique token event count are both preserved.
4. Final session total uses the last unique token event.
5. Duplicate token events do not inflate interval analysis.

Example fixture:

```text
token_count total=100
token_count total=200
token_count total=200
token_count total=300
```

Expected:

```text
raw token events = 4
unique token events = 3
final total = 300
```

### 3. `non_cached_input_tokens` and cache rate

`non_cached_input_tokens` is the most important cause-analysis metric.

Formula:

```text
non_cached_input_tokens = input_tokens - cached_input_tokens
```

Test cases:

1. Normal values produce the expected difference.
2. If `cached_input_tokens > input_tokens`, result is clamped to `0`.
3. `cache_hit_rate = cached_input_tokens / input_tokens`.
4. If `input_tokens == 0`, `cache_hit_rate` is `None`.

### 4. Context window ratio

Verify context window pressure calculation.

Formula:

```text
context_ratio = input_tokens / model_context_window
```

Test cases:

1. Ratio is calculated when `model_context_window > 0`.
2. Ratio is `None` when `model_context_window` is missing.
3. Ratio is `None` when `model_context_window == 0`.

### 5. `function_call` and `function_call_output` join

Tool output attribution depends on joining tool calls by `call_id`.

Test cases:

1. `function_call.call_id` joins to `function_call_output.call_id`.
2. `exec_command` command text is extracted from `payload.arguments.cmd`.
3. `function_call_output.output` length is counted as `output_chars`.
4. Multiple outputs for the same `call_id` are summed.
5. Output without a preceding call does not crash parsing.
6. Call without output appears with `output_chars == 0`.

### 6. `custom_tool_call` and `view_image`

Image/tool payloads can be larger than shell outputs and must not be treated as shell commands.

Test cases:

1. `custom_tool_call` is parsed as a tool call.
2. `name == "view_image"` is preserved.
3. `input.path` or relevant input is used as preview.
4. `custom_tool_call_output` contributes to `output_chars`.
5. `view_image` appears in tool output rankings.
6. `view_image` does not appear when `--exec-only` is used.

### 7. Interval attribution

Interval attribution is the core heuristic for finding likely token drivers.

Definition:

```text
For token_count N:
  interval = events between previous unique token_count and token_count N
```

Test cases:

1. Events between unique token counts are grouped into intervals.
2. Event type raw character totals are aggregated per interval.
3. Tool output character totals are aggregated per interval.
4. Exec command output character totals are aggregated per interval.
5. Duplicate token counts are not treated as interval boundaries.
6. Intervals contain top event types sorted by raw character size.

Important design decision:

```text
Duplicate token_count events should be ignored for interval boundaries.
Intervals should be based on unique token_count events only.
```

### 8. Large events

Large events are useful for detecting abnormal token drivers such as giant user messages, compacted context, patches, image/tool outputs, and assistant messages.

Test cases:

1. Events with `raw_chars >= min_chars` are included.
2. Events below `min_chars` are excluded.
3. Results are sorted by `raw_chars` descending.
4. Large event rows include line number, timestamp, event type, raw character size, and preview.
5. Preview is truncated and does not dump full event bodies.
6. `--min-chars` affects output.

### 9. Compaction events and compaction impact

Compaction can be a major context driver and should be analyzed separately.

Test cases:

1. `type == "compacted"` is detected.
2. `payload.type == "context_compacted"` is detected.
3. Compaction table includes line, timestamp, raw chars, event type.
4. The nearest previous unique token event is found.
5. The nearest following unique token event is found.
6. Before/after input, cached input, non-cached input, output, total, and context ratio are shown.
7. Missing before/after token events do not crash the report.

### 10. JSON output

JSON output is important for future dashboard support.

Test cases:

1. `analyze --json` emits valid JSON.
2. `sessions --json` emits valid JSON.
3. Numeric values are numbers, not formatted strings.
4. Non-ASCII text is preserved.
5. JSON includes session summary, drivers, heaviest tools, intervals, large events, and compactions.

## Secondary test areas

### 11. File discovery

Test cases:

1. A direct `.jsonl` file path is accepted.
2. A directory recursively discovers `.jsonl` files.
3. Glob patterns are accepted.
4. Non-JSONL files are ignored when scanning directories.
5. Invalid JSON lines are skipped without crashing.

### 12. Session selection

Test cases:

1. `--session` matches by session id substring.
2. `--session` matches by path substring.
3. Without `--session`, the highest-token session is selected.
4. No matching session returns a clear error.

### 13. CLI smoke tests

Smoke tests should verify that commands run without crashing against a small fixture.

Commands:

```bash
codex-token-trace --help
codex-token-trace analyze <fixture>
codex-token-trace analyze --json <fixture>
codex-token-trace sessions <fixture-dir>
codex-token-trace sessions --json <fixture-dir>
codex-token-trace timeline <fixture>
codex-token-trace tools <fixture>
codex-token-trace tools --exec-only <fixture>
codex-token-trace intervals <fixture>
codex-token-trace compactions <fixture>
codex-token-trace large-events <fixture>
```

## Recommended fixtures

Fixtures should be small artificial JSONL files under:

```text
tests/fixtures/
```

### `minimal_session.jsonl`

Purpose:

- basic `token_count` extraction

Contents:

```text
session_meta
token_count with info null
valid token_count
```

### `duplicate_token_session.jsonl`

Purpose:

- duplicate token handling

Contents:

```text
token_count total=100
token_count total=200
token_count total=200
token_count total=300
```

Expected:

```text
raw token events = 4
unique token events = 3
final total = 300
```

### `command_heavy_session.jsonl`

Purpose:

- `function_call` / `function_call_output` join
- exec command ranking
- interval tool output attribution

Contents:

```text
token_count
function_call exec_command call_1 cmd="rg foo src"
function_call_output call_1 output=1000 chars
token_count
```

### `image_tool_session.jsonl`

Purpose:

- `custom_tool_call`
- `view_image`
- non-exec tool outputs

Contents:

```text
custom_tool_call name=view_image input.path=/tmp/a.png
custom_tool_call_output output=large
token_count
```

### `compaction_session.jsonl`

Purpose:

- compaction detection
- compaction impact

Contents:

```text
token_count before
compacted huge
event_msg context_compacted
token_count after
```

### `large_events_session.jsonl`

Purpose:

- large event filtering
- preview truncation

Contents:

```text
event_msg user_message large
response_item message large
event_msg patch_apply_end large
response_item reasoning medium
token_count
```

## Suggested initial test order

Implement tests in this order:

1. `test_token_count_extraction`
2. `test_duplicate_token_count_is_excluded`
3. `test_non_cached_input_and_cache_rate`
4. `test_context_ratio`
5. `test_function_call_output_join`
6. `test_multiple_outputs_are_summed`
7. `test_custom_tool_view_image_output`
8. `test_exec_only_excludes_view_image`
9. `test_interval_attribution_between_unique_token_counts`
10. `test_duplicate_token_count_does_not_create_interval_boundary`
11. `test_large_events_min_chars`
12. `test_compaction_before_after_token_counts`
13. `test_analyze_json_is_valid`
14. `test_cli_smoke_commands`

## Non-goals for the initial test suite

The initial automated tests do not need to verify:

- exact terminal table alignment
- exact output formatting for every column
- performance on very large real logs
- browser dashboard behavior
- exact tokenization of arbitrary text
- OpenAI billing equivalence

These can be addressed later with integration tests and snapshot tests.

## Future test improvements

After the core parser/report tests are stable, add:

1. Snapshot tests for representative CLI output.
2. Performance tests against a large anonymized JSONL fixture.
3. Golden JSON tests for dashboard-compatible output.
4. Property tests for malformed or partial Codex events.
5. Regression tests created from real bugs found in local logs.
