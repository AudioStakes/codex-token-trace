# codex-token-trace

Trace what drives Codex token usage from local session logs.

`codex-token-trace` reads Codex session JSONL files such as:

```text
~/.codex/sessions/**/*.jsonl
```

It does not call OpenAI APIs, proxy traffic, or modify Codex behavior. It is a local, offline analysis tool.

## What it shows

- Accurate token usage from Codex `token_count` events
- When token usage happened
- Input / cached input / non-cached input / output / reasoning output tokens
- Context window usage from `model_context_window`
- Heavy tool outputs by joining tool calls and outputs via `call_id`
- Separate rankings for all tool outputs and `exec_command` outputs
- Likely token drivers by event type and raw JSON size
- Context compaction events such as `compacted` / `context_compacted`
- Intervals where non-cached input spiked, including the largest event types inside each interval
- Optional JSON output for dashboards or further processing

## Install from source

Use a virtual environment on Homebrew Python / macOS:

```bash
cd codex-token-trace
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -U pip
python3 -m pip install -e .
```

Then run:

```bash
codex-token-trace analyze
```

By default it scans `~/.codex/sessions`.

## Commands

### Analyze the highest-token session

```bash
codex-token-trace analyze
```

### Analyze a specific file

```bash
codex-token-trace analyze ~/.codex/sessions/2026/03/31/rollout-xxx.jsonl
```

### Analyze a specific session by substring

```bash
codex-token-trace analyze --session 019d43d2
```

### Emit JSON

```bash
codex-token-trace analyze --json > report.json
```

### List sessions

```bash
codex-token-trace sessions --limit 20
```

### Show heaviest tool outputs

```bash
codex-token-trace tools ~/.codex/sessions/2026/03/31/rollout-xxx.jsonl
```

### Show only shell command outputs

```bash
codex-token-trace tools --exec-only ~/.codex/sessions/2026/03/31/rollout-xxx.jsonl
```

The old `commands` subcommand remains as an alias for `tools`.

### Show token timeline

```bash
codex-token-trace timeline ~/.codex/sessions/2026/03/31/rollout-xxx.jsonl
```

### Show non-cached input spikes

```bash
codex-token-trace intervals ~/.codex/sessions/2026/03/31/rollout-xxx.jsonl
```

### Show compaction events

```bash
codex-token-trace compactions ~/.codex/sessions/2026/03/31/rollout-xxx.jsonl
```

## Key concepts

### `input_tokens`

The visible context size for a model call. This can be large when prior context is carried forward.

### `cached_input_tokens`

The part of input that appears to be served from prompt cache. Large cached input means the visible context is large, but the new incremental cost/pressure may be smaller.

### `non_cached_input_tokens`

Calculated as:

```text
input_tokens - cached_input_tokens
```

This is often the most useful signal for finding newly introduced token pressure.

### tool output chars

Calculated from tool output payload lengths, such as `function_call_output.payload.output.length` or custom tool output payloads. This is not an official token count. It is a cause-analysis signal used to identify outputs that likely contributed to later input tokens.

### interval attribution

For each `token_count`, the tool looks at events between the previous unique `token_count` and the current one. This makes command output, image/tool output, user messages, assistant messages, reasoning, and compaction visible as candidate drivers for the next token usage event.

## Privacy

This tool parses local Codex JSONL files. Those files may contain prompts, code snippets, command outputs, images/tool payload metadata, and other sensitive data.

The default reports print command strings and sizes, but do not print command output bodies. Be careful before sharing raw session files or verbose reports.

## Current limitations

- Model name and project metadata are not fully extracted yet.
- Output size is measured in characters, not exact tokens.
- Cause analysis is heuristic: official token counts come from `token_count`, while driver attribution comes from surrounding event sizes.
- Browser dashboard is not implemented yet.

## Development

Run tests:

```bash
python3 -m pytest
```
