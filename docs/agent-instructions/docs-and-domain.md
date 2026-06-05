# Docs and Domain

## Overview

Use the repo docs to record project-specific language and durable design decisions.

## Rules

- Use `docs/agent-skills/grill-with-docs.md` when a new term or design decision appears.
- Keep `CONTEXT.md` for project-specific terms only.
- Define what the term is, not what it does.
- Keep definitions tight: one or two sentences.
- Prefer one canonical term and mark discouraged alternatives with `_Avoid_`.
- Create ADRs in `docs/adr/` only for hard-to-reverse, surprising, or tradeoff-heavy decisions.
- Keep ADRs short.
- Number ADRs sequentially, for example `0001-slug.md`, `0002-slug.md`.

## When To Add Docs

- Add a `CONTEXT.md` term when shared vocabulary becomes visible in the codebase or docs.
- Add an ADR when the decision would be hard to unwind later.
