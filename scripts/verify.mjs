#!/usr/bin/env node
import { spawn } from "node:child_process";

const checks = [
  ["format", "npx", ["biome", "format", "."]],
  ["lint", "npx", ["biome", "check", "."]],
  ["test", "npm", ["run", "test", "--silent"]],
  ["build", "npm", ["run", "build", "--silent"]],
  ["cli help", "npm", ["run", "dev", "--silent", "--", "--help"]],
  [
    "cli analyze json smoke",
    "npm",
    [
      "run",
      "dev",
      "--silent",
      "--",
      "analyze",
      "--json",
      "tests/fixtures/minimal-session.jsonl",
    ],
  ],
  [
    "cli diagnose smoke",
    "npm",
    [
      "run",
      "dev",
      "--silent",
      "--",
      "diagnose",
      "--limit",
      "2",
      "tests/fixtures/diagnose-session.jsonl",
    ],
  ],
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
  /^\s*❯\s+/,
  /^\s*\d+\|/,
  /error TS\d+:/,
  /Found \d+ error/,
  /Found \d+ errors/,
  /would have printed/,
];

const maxLinesPerFailure = 14;

function compactOutput(output) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  const important = lines.filter((line) =>
    importantLinePatterns.some((pattern) => pattern.test(line)),
  );

  const selected = important.length > 0 ? important : lines.slice(-maxLinesPerFailure);
  return selected.slice(0, maxLinesPerFailure).join("\n");
}

function runCheck([name, command, args]) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
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
        name,
        command,
        args,
        ok: false,
        exitCode: null,
        output: error instanceof Error ? error.message : String(error),
      });
    });

    child.on("close", (exitCode) => {
      resolve({
        name,
        command,
        args,
        ok: exitCode === 0,
        exitCode,
        output: compactOutput(`${stdout}\n${stderr}`),
      });
    });
  });
}

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
