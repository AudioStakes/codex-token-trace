# Development

## Overview

Use TypeScript for new implementation work. The Python code under `legacy-python/` is reference only.

## Rules

- Follow `.agents/skills/tdd/SKILL.md` for behavior changes, bug fixes, and new features.
- Keep parser, report, and CLI behavior separately testable.
- Prefer the smallest reviewable change that satisfies the request.
- Keep implementation aligned with the Node/Vitest/Biome toolchain.
