# AGENTS.md

## Project overview

`codex-token-trace` is a local-first CLI for analyzing Codex session JSONL logs and tracing what drives token usage.

The project is being migrated from Python to TypeScript. Prefer TypeScript for new implementation work.

## Repository-local skills

Use repository-local skill documents when relevant. These files are the source of truth for agent workflows even when external skills are unavailable:

- For implementation work, follow `docs/agent-skills/tdd.md`.
- For design decision and domain language clarification, follow `docs/agent-skills/grill-with-docs.md`.

When a prompt mentions `/tdd`, read and follow `docs/agent-skills/tdd.md`.
When a prompt mentions `/grill-with-docs`, read and follow `docs/agent-skills/grill-with-docs.md`.

## Default workflow

- Use the repository-local TDD workflow in `docs/agent-skills/tdd.md` for implementation work.
- Start by adding or updating tests that describe the intended behavior.
- Implement the smallest change that makes the tests pass.
- Keep parser behavior, report behavior, and CLI behavior separately testable.
- Prefer small, reviewable changes over broad rewrites.

## Required checks before finishing work

Before reporting that work is complete, run all of the following:

```bash
npm run format
npm run lint
npm run test
```

If the change affects TypeScript build output or package structure, also run:

```bash
npm run build
```

If any command cannot be run, report that explicitly with the reason.

## Formatting and linting

- Follow `.editorconfig` and `biome.json`.
- Use Biome for formatting, linting, and import organization.
- Do not manually fight the formatter; change the code shape instead.
- Keep TypeScript strictness intact. Do not relax `tsconfig.json` or Biome rules unless there is a documented reason.

## Testing expectations

- Add tests for new parser behavior, report behavior, and CLI behavior.
- Prefer small artificial JSONL fixtures over large real Codex logs.
- Official token usage should come from `token_count` events.
- Cause attribution is heuristic and should be tested separately from official token counts.
- Keep JSON output stable enough to support future dashboard work.

## Documentation of design decisions

When a new design decision is made, or when an implicit design decision becomes visible during work, use `docs/agent-skills/grill-with-docs.md` to consider whether it should be recorded as an ADR.

ADRs follow `docs/agent-skills/grill-with-docs.md` and the ADR format from `mattpocock/skills`:

- Store ADRs in `docs/adr/`.
- Create `docs/adr/` lazily when the first ADR is needed.
- Use sequential numbering: `0001-slug.md`, `0002-slug.md`, etc.
- Keep the ADR short.
- Required format:

```md
# {Short title of the decision}

{1-3 sentences: what's the context, what did we decide, and why.}
```

Optional sections such as status, considered options, and consequences are allowed only when they add real value.

Create an ADR when the decision is:

- hard to reverse,
- surprising without context,
- and the result of a real trade-off.

Do not create ADRs for obvious, easily reversible, or purely mechanical choices.

## Documentation of domain language

When a new domain term is introduced, or when an implicit domain term becomes visible during work, use `docs/agent-skills/grill-with-docs.md` to consider whether it should be recorded in project context documentation.

Domain context follows `docs/agent-skills/grill-with-docs.md` and the CONTEXT format from `mattpocock/skills`:

- For this repository, use a root `CONTEXT.md` unless multiple bounded contexts emerge later.
- Create `CONTEXT.md` lazily when the first project-specific term is resolved.
- Keep definitions tight: one or two sentences.
- Define what the term is, not what it does.
- Only include terms specific to this project context.
- Do not add general programming concepts.
- Prefer one canonical term and list discouraged alternatives with `_Avoid_`.

Root `CONTEXT.md` format:

```md
# codex-token-trace Context

{One or two sentence description of what this context is and why it exists.}

## Language

**{Term}**:
{One or two sentence definition.}
_Avoid_: {discouraged synonym}, {discouraged synonym}
```

## Reporting expectations

After finishing work, include the normal summary plus these items:

- What changed.
- What checks were run and whether they passed.
- Any decisions that were unclear or required judgment.
- Any assumptions made without explicit user confirmation.
- Any design decisions added to ADRs, or why none were added.
- Any domain terms added to `CONTEXT.md`, or why none were added.
- Any follow-up work that remains.

Do not omit uncertainty. If something was guessed, say so.

## Safety and privacy

- Codex session logs may contain prompts, source code, file paths, command outputs, screenshots, or other sensitive data.
- Do not add real user session logs to the repository.
- Use small synthetic fixtures for tests.
- Do not print raw command outputs or full event bodies unless explicitly needed for debugging.

## Implementation notes

- Keep official token counts separate from heuristic driver attribution.
- Treat `token_count` as the source of truth for token usage.
- Treat event sizes, tool output sizes, large events, and interval attribution as cause-analysis signals.
- Preserve the distinction between:
  - input tokens,
  - cached input tokens,
  - non-cached input tokens,
  - output tokens,
  - reasoning output tokens.
- Avoid mixing shell commands, custom tools, image tools, and patch tools into a single undifferentiated concept in reports.
