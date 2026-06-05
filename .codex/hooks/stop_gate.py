#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


IMPORTANT_LINE_PATTERNS = (
    r"^\s*FAIL\s+",
    r"^\s*×\s+",
    r"^\s*Error:",
    r"^\s*AssertionError:",
    r"^\s*TypeError:",
    r"^\s*\S+Error:",
    r"error TS\d+:",
    r"Found \d+ error",
)
MAX_LINES_PER_FAILURE = 14


def _read_stdin_json() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {"value": parsed}


def _repo_root() -> Path:
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            check=True,
            capture_output=True,
            text=True,
        )
        return Path(completed.stdout.strip())
    except Exception:
        return Path.cwd()


def _input_strings(value: Any) -> list[str]:
    strings: list[str] = []
    if isinstance(value, dict):
        for item in value.values():
            strings.extend(_input_strings(item))
    elif isinstance(value, list):
        for item in value:
            strings.extend(_input_strings(item))
    elif isinstance(value, str):
        strings.append(value)
    return strings


def _effective_cwd(payload: dict[str, Any], repo_root: Path) -> str:
    for key in ("cwd", "working_directory", "workingDirectory"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return str(repo_root)


def _turn_key(payload: dict[str, Any], repo_root: Path) -> str:
    cwd = _effective_cwd(payload, repo_root)
    session_id = str(payload.get("session_id") or payload.get("sessionId") or "")
    turn_id = str(payload.get("turn_id") or payload.get("turnId") or "")
    if session_id or turn_id:
        return f"{cwd}\0{session_id}\0{turn_id}"
    return f"{cwd}\0no-session\0no-turn"


def _cache_path() -> Path:
    cache_home = os.environ.get("XDG_CACHE_HOME")
    if cache_home:
        return Path(cache_home) / "codex-stop-gate" / "state.json"
    return Path.home() / ".cache" / "codex-stop-gate" / "state.json"


def _load_state(path: Path) -> dict[str, Any]:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return {"entries": {}}
    try:
        loaded = json.loads(raw)
    except json.JSONDecodeError:
        return {"entries": {}}
    if isinstance(loaded, dict) and isinstance(loaded.get("entries"), dict):
        return loaded
    return {"entries": {}}


def _save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
    tmp_path.replace(path)


def _run_command(command: list[str]) -> subprocess.CompletedProcess[str] | None:
    try:
        return subprocess.run(command, check=False, capture_output=True, text=True)
    except OSError:
        return None


def _concat_output(result: subprocess.CompletedProcess[str] | None) -> str:
    if result is None:
        return ""
    return "".join(part for part in (result.stdout, result.stderr) if part)


def _summarize_failure(result: subprocess.CompletedProcess[str] | None, label: str) -> str:
    output = _concat_output(result)
    lines = [line.rstrip() for line in output.splitlines() if line.strip()]
    important = [
        line
        for line in lines
        if any(re.search(pattern, line) for pattern in IMPORTANT_LINE_PATTERNS)
    ]
    fallback = [line for line in lines if len(line) <= 200]
    selected = important if important else fallback[-MAX_LINES_PER_FAILURE:]
    summary: list[str] = [f"[{label}] npm run {label}"]
    if result is not None:
        summary.append(f"exit: {result.returncode}")
    if selected:
        summary.extend(selected[:MAX_LINES_PER_FAILURE])
    return "\n".join(summary)


def _is_retrospective_response(payload: dict[str, Any]) -> bool:
    for text in _input_strings(payload):
        stripped = text.strip()
        if stripped == "## Retrospective":
            return True
        if stripped.startswith("## Retrospective\n"):
            return True
        if stripped == "Retrospective":
            return True
        if stripped.startswith("Retrospective\n") or stripped.endswith("\nRetrospective"):
            return True
    return False


def _write_json(obj: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.write("\n")


def _write_pass() -> None:
    _write_json({})


def main() -> int:
    payload = _read_stdin_json()
    repo_root = _repo_root()
    key = _turn_key(payload, repo_root)

    if _is_retrospective_response(payload):
        _write_pass()
        return 0

    state_path = _cache_path()
    state = _load_state(state_path)
    entries = state.setdefault("entries", {})

    if entries.get(key, {}).get("retrospective_requested"):
        _write_pass()
        return 0

    fix_result = _run_command(["npm", "run", "fix", "--silent"])
    if fix_result is None or fix_result.returncode != 0:
        reason = "Auto-fix failed. Run npm run fix and fix the reported issue."
        _write_json({"decision": "block", "reason": reason})
        return 0

    verify_result = _run_command(["npm", "run", "verify", "--silent"])
    if verify_result is None or verify_result.returncode != 0:
        reason = "Repository verification failed.\n\n"
        reason += _summarize_failure(verify_result, "verify")
        reason += "\n\nFix the failures above and rerun the verification gate."
        _write_json({"decision": "block", "reason": reason})
        return 0

    prompt_path = repo_root / ".codex" / "hooks" / "prompts" / "stop_retrospective.txt"
    try:
        retrospective_prompt = prompt_path.read_text(encoding="utf-8")
    except OSError:
        _write_json(
            {
                "decision": "block",
                "reason": "Retrospective prompt file is missing: .codex/hooks/prompts/stop_retrospective.txt",
            }
        )
        return 0

    if not retrospective_prompt.strip():
        _write_json(
            {
                "decision": "block",
                "reason": "Retrospective prompt file is empty: .codex/hooks/prompts/stop_retrospective.txt",
            }
        )
        return 0

    entries[key] = {"retrospective_requested": True}
    _save_state(state_path, state)
    _write_json({"decision": "block", "reason": retrospective_prompt})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
