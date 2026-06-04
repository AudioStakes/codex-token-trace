import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run } from "../src/cli.js";

const writeFixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ctt-cli-"));
  const path = join(dir, "session.jsonl");
  const rows = [
    {
      timestamp: "t1",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 20,
            output_tokens: 5,
            reasoning_output_tokens: 1,
            total_tokens: 105,
          },
          last_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 20,
            output_tokens: 5,
            reasoning_output_tokens: 1,
            total_tokens: 105,
          },
          model_context_window: 1000,
        },
      },
    },
  ];
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  return path;
};

describe("cli", () => {
  it("runs analyze json", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const code = run(["analyze", writeFixture(), "--json"]);
    expect(code).toBe(0);
    const output = spy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(JSON.parse(output)).toHaveProperty("session");
    spy.mockRestore();
  });

  it("prints help", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(run(["--help"])).toBe(0);
    expect(spy.mock.calls[0]?.[0]).toContain("Usage:");
    spy.mockRestore();
  });
});
