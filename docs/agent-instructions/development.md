# Development

## Overview

Use TypeScript for new implementation work. The Python code under `legacy-python/` is reference only.

## Rules

- Always prefix shell commands with `rtk`.
- Use `npm` scripts for normal workflows.
- Follow `docs/agent-skills/tdd.md` for behavior changes, bug fixes, and new features.
- Keep parser, report, and CLI behavior separately testable.
- Prefer the smallest reviewable change that satisfies the request.
- Keep implementation aligned with the Node/Vitest/Biome toolchain.

## Commands

- `npm install`
- `npm run build`
- `npm run dev -- ...`
- `npm run fix`
- `npm run verify`
