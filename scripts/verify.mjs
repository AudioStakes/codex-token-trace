#!/usr/bin/env node
import { spawn } from "node:child_process";

const checks = [
  {
    name: "format",
    command: "npx",
    args: ["biome", "format", "."],
  },
  {
    name: "lint",
    command: "npx",
    args: ["biome", "check", "."],
  },
  {
    name: "test",
    command: "npm",
    args: ["run", "test", "--silent"],
  },
  {
    name: "build",
    command: "npm",
    args: ["run", "build", "--silent"],
  },
  {
    name: "cli help",
    command: "npm",
    args: ["run", "dev", "--silent", "--", "--help"],
  },
  {
    name: "cli analyze json smoke",
    command: "npm",
    args: [
      "run",
      "dev",
      "--silent",
      "--",
      "analyze",
      "--json",
      "tests/fixtures/minimal-session.jsonl",
    ],
  },
  {
    name: "cli diagnose smoke",
    command: "npm",
    args: [
      "run",
      "dev",
      "--silent",
      "--",
      "diagnose",
      "--limit",
      "2",
      "tests/fixtures/diagnose-session.jsonl",
    ],
  },
];

const importantLinePatterns = [
  /^\s*FAIL\s+/,
  /^\s*×\s+/,
  /^\s*Error:/,
  /^\s*AssertionError:/,
  /^\s*TypeError:/,
  /^\s*ReferenceError:/,
  /^\s*SyntaxError:/,
  /^\s*\S+Error:/,
  /^\s*at\s+/,
  /^\s*❯\s+/,
  /^\s*\d+\|/,
  /error TS\d+:/,
  /Found \d+ error/,
  /Found \d+ errors/,
  /would have printed/,
];

const maxLinesPerFailure = 14;

const compactOutput = (output) => {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  const important = [];

  for (const line of lines) {
    if (importantLinePatterns.some((pattern) => pattern.test(line))) {
      important.push(line);
    }
  }

  const selected = important.length > 0 ? important : lines.slice(-maxLinesPerFailure);

  return selected.slice(0, maxLinesPerFailure).join("\n");
};

const runCheck = (check) =>
  new Promise((resolve) => {
    const child = spawn(check.command, check.args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      resolve({
        ...check,
        ok: false,
        exitCode: null,
        output: error instanceof Error ? error.message : String(error),
      });
    });

    child.on("close", (exitCode) => {
      resolve({
        ...check,
        ok: exitCode === 0,
        exitCode,
        output: compactOutput(`${stdout}\n${stderr}`),
      });
    });
  });

const failures = [];

for (const check of checks) {
  const result = await runCheck(check);

  if (!result.ok) {
    failures.push(result);
  }
}

if (failures.length === 0) {
  process.exit(0);
}

console.error(`Verification failed: ${failures.length} check(s) failed.`);

for (const failure of failures) {
  console.error("");
  console.error(`[${failure.name}] ${failure.command} ${failure.args.join(" ")}`);
  console.error(`exit: ${failure.exitCode ?? "error"}`);

  if (failure.output.length > 0) {
    console.error(failure.output);
  }
}

console.error("");
console.error("Fix the failures above and rerun npm run verify.");

process.exit(1);
