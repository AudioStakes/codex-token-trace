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

## Communication style

Use an extremely compressed style for user-facing replies.

Remove greetings, filler, excessive politeness, hedging, and redundant words; prefer short direct sentences, compact technical wording, arrows, and abbreviations when clear.

Do not compress code, command output, errors, file contents, docs, commits, or PR text; use normal clear prose when compression would hurt correctness, safety, or clarity.

## Default workflow

- Use the repository-local TDD workflow in `docs/agent-skills/tdd.md` for implementation work.
- Add or update tests that describe intended behavior when the change calls for test coverage.
- Implement the smallest change that satisfies the requested behavior.
- Keep parser behavior, report behavior, and CLI behavior separately testable.
- Prefer small, reviewable changes over broad rewrites.

## Verification

Final verification is handled by the Codex Stop hook.

Do not run focused tests, full tests, lint, typecheck, formatting checks, or other routine verification commands during normal development unless they are specifically needed for debugging or investigation.

## Git and PR workflow

Before finishing work:

- Commit the final changes.
- Push the current branch.
- Create a pull request, or update the existing pull request for the current branch.

If currently on `main`, create or switch to a non-`main` work branch before committing.

## Formatting and linting

- Follow `.editorconfig` and `biome.json`.
- Do not manually fight the formatter; change the code shape instead.
- Do not relax `tsconfig.json` or Biome rules unless there is a documented reason.

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
- The pull request URL, or which existing PR was updated.
- Any design decisions added to ADRs, or why none were added.
- Any domain terms added to `CONTEXT.md`, or why none were added.
- Any follow-up work that remains.

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


<!-- headroom:rtk-instructions -->
# RTK (Rust Token Killer) - Token-Optimized Commands

When running shell commands, **always prefix with `rtk`**. This reduces context
usage by 60-90% with zero behavior change. If rtk has no filter for a command,
it passes through unchanged — so it is always safe to use.

## Key Commands
```bash
# Git (59-80% savings)
rtk git status          rtk git diff            rtk git log

# Files & Search (60-75% savings)
rtk ls <path>           rtk read <file>         rtk grep <pattern>
rtk find <pattern>      rtk diff <file>

# Test (90-99% savings) — shows failures only
rtk pytest tests/       rtk cargo test          rtk test <cmd>

# Build & Lint (80-90% savings) — shows errors only
rtk tsc                 rtk lint                rtk cargo build
rtk prettier --check    rtk mypy                rtk ruff check

# Analysis (70-90% savings)
rtk err <cmd>           rtk log <file>          rtk json <file>
rtk summary <cmd>       rtk deps                rtk env

# GitHub (26-87% savings)
rtk gh pr view <n>      rtk gh run list         rtk gh issue list

# Infrastructure (85% savings)
rtk docker ps           rtk kubectl get         rtk docker logs <c>

# Package managers (70-90% savings)
rtk pip list            rtk pnpm install        rtk npm run <script>
```

## Rules
- In command chains, prefix each segment: `rtk git add . && rtk git commit -m "msg"`
- For debugging, use raw command without rtk prefix
- `rtk proxy <cmd>` runs command without filtering but tracks usage
<!-- /headroom:rtk-instructions -->
