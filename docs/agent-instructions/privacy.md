# Privacy

## Overview

Local Codex logs can contain sensitive information.

## Rules

- Do not add real user session logs to the repository.
- Use small synthetic fixtures for tests.
- Do not print raw command outputs or full event bodies unless needed for debugging.
- Assume session JSONL files may contain prompts, source code, file paths, screenshots, and tool payloads.
