#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const checks = [
  ["npm", ["run", "format:check"]],
  ["npm", ["run", "lint"]],
  ["npm", ["run", "test"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "dev", "--", "--help"]],
  ["npm", ["run", "dev", "--", "analyze", "--json", "tests/fixtures/minimal-session.jsonl"]],
  ["npm", ["run", "dev", "--", "diagnose", "--limit", "2", "tests/fixtures/diagnose-session.jsonl"]],
];

for (const [command, args] of checks) {
  const label = [command, ...args].join(" ");
  console.error(`verify: ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`verify failed: ${label}`);
    process.exit(result.status ?? 1);
  }
}
