import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const hooksConfigPath = join(repoRoot, ".codex", "hooks.json");
const stopGatePath = join(repoRoot, ".codex", "hooks", "stop_gate.py");
const stopVerifyPath = join(repoRoot, ".codex", "hooks", "stop_verify.sh");
const retrospectivePromptPath = join(
  repoRoot,
  ".codex",
  "hooks",
  "prompts",
  "stop_retrospective.txt",
);

type RunOptions = {
  npmMode?: "success" | "verify-fail" | "fix-fail";
  npmLogPath?: string;
  cwd?: string;
  xdgCacheHome?: string;
};

const runStopGate = (input: unknown, options: RunOptions = {}) => {
  const tempDir = mkdtempSync(join(tmpdir(), "ctt-stop-gate-"));
  const binDir = join(tempDir, "bin");
  const npmStub = join(binDir, "npm");
  const npmLogPath = options.npmLogPath ?? join(tempDir, "npm.log");
  const xdgCacheHome = options.xdgCacheHome ?? join(tempDir, "cache");
  const npmMode = options.npmMode ?? "success";
  const hugeLine = "x".repeat(2000);

  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    npmStub,
    `#!/bin/sh
set -eu
printf '%s\n' "$*" >> "${npmLogPath}"
mode="${npmMode}"
if [ "$1" = "run" ] && [ "$2" = "fix" ]; then
  case "$mode" in
    success)
      exit 0
      ;;
    fix-fail)
      printf '%s\n' "Auto-fix failed: ${hugeLine}" >&2
      exit 1
      ;;
    verify-fail)
      exit 0
      ;;
  esac
fi
if [ "$1" = "run" ] && [ "$2" = "verify" ]; then
  case "$mode" in
    success)
      exit 0
      ;;
    verify-fail)
      printf '%s\n' "Verification failed: 1 check(s) failed." >&2
      printf '%s\n' "[verify] npm run verify" >&2
      printf '%s\n' "exit: 1" >&2
      printf '%s\n' "Fix the failures above and rerun the verification gate." >&2
      exit 1
      ;;
    fix-fail)
      exit 0
      ;;
  esac
fi
printf '%s\n' "unexpected npm call: $*" >&2
exit 1
`,
    { encoding: "utf8" },
  );
  chmodSync(npmStub, 0o755);

  const result = spawnSync("python3", [stopGatePath], {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      XDG_CACHE_HOME: xdgCacheHome,
    },
    input: JSON.stringify(input),
    encoding: "utf8",
  });

  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    npmLogPath,
    cacheHome: xdgCacheHome,
  };
};

const parseJson = (text: string): Record<string, unknown> => JSON.parse(text);

const expectExactJsonStdout = (stdout: string, expected: Record<string, unknown>) => {
  const trimmed = stdout.trim();
  expect(trimmed).toBe(JSON.stringify(expected));
  expect(JSON.parse(trimmed)).toEqual(expected);
  expect(stdout).toBe(`${trimmed}\n`);
};

describe("stop gate", () => {
  it("keeps the Stop hook configuration to a single stop_gate command", () => {
    const hooksConfig = parseJson(readFileSync(hooksConfigPath, "utf8"));

    expect((hooksConfig as { hooks: { Stop: unknown } }).hooks.Stop).toEqual([
      {
        hooks: [
          {
            type: "command",
            command: 'python3 "$(git rev-parse --show-toplevel)/.codex/hooks/stop_gate.py"',
            timeout: 600,
            statusMessage: "Running final verification",
          },
        ],
      },
    ]);
    expect(readFileSync(hooksConfigPath, "utf8")).not.toContain("stop_verify.sh");
    expect(readFileSync(stopVerifyPath, "utf8")).toContain("npm run fix --silent");
  });

  it("blocks with the retrospective prompt after successful fix and verify", () => {
    const result = runStopGate({
      session_id: "session-a",
      turn_id: "turn-1",
      cwd: repoRoot,
    });

    const output = parseJson(result.stdout.trim());
    const statePath = join(result.cacheHome, "codex-stop-gate", "state.json");
    const state = parseJson(readFileSync(statePath, "utf8"));

    expect(result.code).toBe(0);
    expect(output).toEqual({
      decision: "block",
      reason: readFileSync(retrospectivePromptPath, "utf8"),
    });
    expectExactJsonStdout(result.stdout, output);
    expect(result.stderr.trim()).toBe("");
    expect(state).toHaveProperty("entries");
    expect(JSON.stringify(state)).toContain("session-a");
    expect(readFileSync(result.npmLogPath, "utf8").trim().split("\n")).toEqual([
      "run fix --silent",
      "run verify --silent",
    ]);
  });

  it("keeps the same turn key stable when other payload fields change", () => {
    const first = runStopGate({
      session_id: "session-stable",
      turn_id: "turn-stable",
      cwd: repoRoot,
      message: "first payload",
    });
    const second = runStopGate(
      {
        session_id: "session-stable",
        turn_id: "turn-stable",
        cwd: repoRoot,
        message: "second payload",
      },
      {
        xdgCacheHome: first.cacheHome,
        npmLogPath: first.npmLogPath,
      },
    );

    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expectExactJsonStdout(second.stdout, {});
    expect(second.stderr.trim()).toBe("");
    expect(readFileSync(first.npmLogPath, "utf8").trim().split("\n")).toEqual([
      "run fix --silent",
      "run verify --silent",
    ]);
  });

  it("approves the same turn after the retrospective request has already been made", () => {
    const first = runStopGate({
      session_id: "session-c",
      turn_id: "turn-3",
      cwd: repoRoot,
      message: "first payload",
    });
    const second = runStopGate(
      {
        session_id: "session-c",
        turn_id: "turn-3",
        cwd: repoRoot,
        message: "## Retrospective\n- None.",
      },
      {
        xdgCacheHome: first.cacheHome,
        npmLogPath: first.npmLogPath,
      },
    );

    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expectExactJsonStdout(second.stdout, {});
    expect(second.stderr.trim()).toBe("");
    expect(readFileSync(first.npmLogPath, "utf8").trim().split("\n")).toEqual([
      "run fix --silent",
      "run verify --silent",
    ]);
  });

  it("approves retrospective responses that start with the retrospective heading", () => {
    const result = runStopGate({
      session_id: "session-d",
      turn_id: "turn-4",
      cwd: repoRoot,
      message: "## Retrospective\n- None.",
    });

    expect(result.code).toBe(0);
    expectExactJsonStdout(result.stdout, {});
    expect(result.stderr.trim()).toBe("");
  });

  it("approves retrospective responses that include numbered items", () => {
    const result = runStopGate({
      session_id: "session-e",
      turn_id: "turn-5",
      cwd: repoRoot,
      message: "## Retrospective\n\n1. Missing/ambiguous context",
    });

    expect(result.code).toBe(0);
    expectExactJsonStdout(result.stdout, {});
    expect(result.stderr.trim()).toBe("");
  });

  it("returns a concise verification failure reason", () => {
    const result = runStopGate(
      {
        session_id: "session-c",
        turn_id: "turn-3",
        cwd: repoRoot,
      },
      {
        npmMode: "verify-fail",
      },
    );
    const output = parseJson(result.stdout.trim());
    const reason = String(output.reason);

    expect(result.code).toBe(0);
    expect(output.decision).toBe("block");
    expect(reason).toContain("Repository verification failed.");
    expect(reason).toContain("[verify] npm run verify");
    expect(reason).toContain("exit: 1");
    expect(reason).toContain("Fix the failures above and rerun the verification gate.");
    expect(reason).not.toContain("x".repeat(100));
    expect(result.stderr.trim()).toBe("");
  });
});
