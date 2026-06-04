import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run } from "../src/cli.js";

const fixturePath = (name: string): string => join(process.cwd(), "tests", "fixtures", name);

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

const captureLog = (fn: () => number): { code: number; output: string } => {
  const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  try {
    const code = fn();
    const output = spy.mock.calls.map((call) => call.join(" ")).join("\n");
    return { code, output };
  } finally {
    spy.mockRestore();
  }
};

describe("cli", () => {
  it("runs analyze json", () => {
    const { code, output } = captureLog(() => run(["analyze", writeFixture(), "--json"]));
    expect(code).toBe(0);
    expect(JSON.parse(output)).toHaveProperty("session");
  });

  it("prints help", () => {
    const { code, output } = captureLog(() => run(["--help"]));
    expect(code).toBe(0);
    expect(output).toContain("Usage:");
  });

  it("emits analyze JSON with expected numeric sections for the minimal fixture", () => {
    const { code, output } = captureLog(() =>
      run(["analyze", "--json", fixturePath("minimal-session.jsonl")]),
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(output) as { session: Record<string, unknown> };
    expect(parsed.session.finalTotal).toEqual(
      expect.objectContaining({ inputTokens: 100, cachedInputTokens: 25, totalTokens: 110 }),
    );
    expect(typeof parsed.session.events).toBe("number");
    expect(parsed.session).toHaveProperty("drivers");
    expect(parsed.session).toHaveProperty("heaviestTools");
    expect(parsed.session).toHaveProperty("intervals");
    expect(parsed.session).toHaveProperty("largeEvents");
    expect(parsed.session).toHaveProperty("compactions");
  });

  it("runs tools exec-only without including view_image tools", () => {
    const { code, output } = captureLog(() =>
      run(["tools", "--exec-only", fixturePath("image-tool-session.jsonl")]),
    );
    expect(code).toBe(0);
    expect(output).toContain("output_chars");
    expect(output).not.toContain("view_image");
  });

  it("runs large-events against the minimal fixture", () => {
    const { code, output } = captureLog(() =>
      run(["large-events", fixturePath("minimal-session.jsonl")]),
    );
    expect(code).toBe(0);
    expect(output).toContain("raw_chars");
  });
});
