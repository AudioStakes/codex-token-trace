# codex-token-trace

`codex-token-trace` is a local-first CLI for analyzing Codex local session JSONL logs and tracing what drives token usage.

It reads local files such as:

```text
~/.codex/sessions/**/*.jsonl
```

It does **not** call the OpenAI API, proxy traffic, upload logs, or change Codex behavior. It is a local, offline analysis tool for inspecting session logs that already exist on your machine.

## What it shows

- Official token usage from Codex `token_count` events
- When token usage happened
- Input / cached input / non-cached input / output / reasoning output tokens
- Context window usage from `model_context_window`
- Heavy tool outputs by joining tool calls and outputs via `call_id`
- Separate rankings for all tool outputs and `exec_command` outputs
- Large raw events such as huge messages, user messages, compactions, patches, and tool outputs
- Context compaction events and before/after token usage
- Intervals where non-cached input spiked, including the largest event types inside each interval
- Short heuristic diagnosis of likely token usage drivers
- Optional JSON output for dashboards or further processing

## Install and development setup

This repository is now a TypeScript / npm project.

```bash
npm install
npm run build
```

Run the CLI during development with `npm run dev --`:

```bash
npm run dev -- analyze
npm run dev -- analyze --json
npm run dev -- analyze --json tests/fixtures/minimal-session.jsonl
```

Run the built CLI after `npm run build`:

```bash
node dist/cli.js analyze
```

You can also link the local package while developing:

```bash
npm link
codex-token-trace analyze
ctt analyze
```

By default, commands scan `~/.codex/sessions`.

## Commands

### Analyze the highest-token session

```bash
codex-token-trace analyze
```

### Diagnose likely token usage drivers

```bash
codex-token-trace diagnose
```

Print a short heuristic diagnosis of the likely token usage drivers for a session.

### List sessions

```bash
codex-token-trace sessions
```

### Show heaviest tool outputs

```bash
codex-token-trace tools
```

### Show only shell command outputs

```bash
codex-token-trace tools --exec-only
```

The old `commands` subcommand remains as an alias for `tools`.


### Show tool usage impact

```bash
codex-token-trace tool-usage
```

Show tool usages with output size and the next token_count observed after each usage. Use `--sort output-chars` (default) or `--sort next-new-input` to change ranking.

Use `--group-by next-token` to group tool usages by the next unique `token_count` line. This grouped view is heuristic: it shows tools observed before the same token interval together, but does not prove which tool caused the token increase.

### Show token timeline

```bash
codex-token-trace timeline
```

### Show non-cached input spikes

```bash
codex-token-trace intervals
```

### Show compaction events and impact

```bash
codex-token-trace compactions
```

### Show large events only

```bash
codex-token-trace large-events
```


### Start a local session timeline explorer server

```bash
codex-token-trace serve
```

Start a local session timeline explorer server. The server selects one session using the same path and `--session` flow as other single-session commands, then serves an inline HTML/CSS/JS UI with summary cards, a normalized pressure graph, an event list, and a detail panel.

Development examples:

```bash
npm run dev -- serve --port 3030
npm run dev -- serve ~/.codex/sessions/2026/05/25/session.jsonl --port 3030
npm run dev -- serve --session rollout-2026-05-25 --port 3030
```

API endpoints:

- `GET /` returns the browser UI.
- `GET /overview` returns the multi-session overview.
- `GET /api/session` returns session summary, pressure series, and timeline markers.
- `GET /api/sessions/overview` returns overview summary and per-session previews.
- `GET /api/events?offset=0&limit=100` returns preview-only event list pages.
- `GET /api/events/:line` returns full detail for one event line.

Browser:

```text
http://localhost:3030/
http://localhost:3030/overview
```

### Common options

Analyze a specific file:

```bash
codex-token-trace analyze ~/.codex/sessions/2026/03/31/rollout-xxx.jsonl
```

Analyze a specific session by substring:

```bash
codex-token-trace analyze --session 019d43d2
```

Adjust the large event threshold:

```bash
codex-token-trace analyze --min-chars 50000
```

Emit JSON:

```bash
codex-token-trace analyze --json > report.json
```

## Key concepts

### `input_tokens`

The visible context size for a model call. This can be large when prior context is carried forward.

### `cached_input_tokens`

The part of input that appears to be served from prompt cache. Large cached input means the visible context is large, but the new incremental cost or pressure may be smaller.

### `non_cached_input_tokens`

Calculated as:

```text
input_tokens - cached_input_tokens
```

This is often the most useful signal for finding newly introduced token pressure.

### Tool output chars

Calculated from tool output payload lengths, such as `function_call_output.payload.output.length` or custom tool output payloads. This is not an official token count. It is a cause-analysis signal used to identify outputs that likely contributed to later input tokens.

### Interval attribution

For each unique `token_count`, the tool looks at events between the previous unique `token_count` and the current one. This makes command output, image/tool output, user messages, assistant messages, reasoning, patches, and compaction visible as candidate drivers for the next token usage event.

## Python implementation archive

Python implementation is archived under `legacy-python/` for reference only. New development should target TypeScript.

The archived Python code is kept so behavior can be compared during the migration. It is no longer the primary implementation, and the repository root should be treated as the TypeScript / npm project.

## Development checks

Run these before finishing changes:

```bash
npm run fix
npm run verify
```

`npm run fix` applies automatic formatting/lint fixes. `npm run verify` runs the read-only verification gate used before completion.

Project-local Codex hooks are configured under `.codex/hooks.json`. The Stop hook runs `npm run fix` followed by `npm run verify` before Codex completes a turn.

## Privacy

This tool parses local Codex JSONL files. Those files may contain prompts, source code, command outputs, file paths, screenshots, image/tool payload metadata, and other sensitive data.

Do not commit real Codex session logs to this repository. Tests should use small synthetic fixtures under `tests/fixtures/`, not real user logs.

The default reports print command strings and input previews, but do not print command output bodies. Be careful before sharing raw session files or verbose reports.

## Current limitations

- Model name and project metadata are not fully extracted yet.
- Output size is measured in characters, not exact tokens.
- Cause analysis is heuristic: official token counts come from `token_count`, while driver attribution comes from surrounding event sizes.
- Browser dashboard is not implemented yet.
