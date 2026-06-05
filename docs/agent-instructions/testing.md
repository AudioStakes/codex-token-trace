# Testing

## Overview

Tests should describe observable behavior through public interfaces.

## Rules

- Add or update tests for parser, report, and CLI behavior changes.
- Use small synthetic JSONL fixtures.
- Do not add real Codex session logs to the repository.
- Treat `token_count` events as the source of truth for official token usage.
- Keep heuristic driver attribution separate from official token counts.
- Write tests that survive internal refactors.
- Prefer one behavior at a time, following red-green-refactor.
- Never refactor while tests are red.
- Run routine verification commands only when debugging or when the task explicitly needs them; the Stop hook already runs `npm run fix` and `npm run verify`.

## Guidance

- Test public interfaces, not implementation details.
- Focus on critical paths and complex logic, not every edge case.
