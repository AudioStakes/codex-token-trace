import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cacheHitRate, nonCachedInputTokens } from "../src/models.js";
import { parseSessionFile } from "../src/parser.js";
import { compactionImpacts, largeEvents } from "../src/reports.js";

const writeJsonl = (rows: Array<Record<string, unknown>>): string => {
  const dir = mkdtempSync(join(tmpdir(), "ctt-"));
  const path = join(dir, "session.jsonl");
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  return path;
};

const token = (total: number, input: number, cached: number, timestamp = "2026-01-01T00:00:00Z") => ({
  timestamp,
  type: "event_msg",
  payload: {
    type: "token_count",
    info: {
      total_token_usage: {
        input_tokens: total,
        cached_input_tokens: cached,
        output_tokens: 10,
        reasoning_output_tokens: 2,
        total_tokens: total + 10,
      },
      last_token_usage: {
        input_tokens: input,
        cached_input_tokens: cached,
        output_tokens: 10,
        reasoning_output_tokens: 2,
        total_tokens: input + 10,
      },
      model_context_window: 1000,
    },
  },
});

describe("parseSessionFile", () => {
  it("extracts token_count events and ignores null info", () => {
    const path = writeJsonl([
      { timestamp: "t0", type: "event_msg", payload: { type: "token_count", info: null } },
      token(100, 100, 20, "t1"),
    ]);
    const analysis = parseSessionFile(path);
    expect(analysis.tokenEvents).toHaveLength(1);
    expect(analysis.uniqueTokenEvents).toHaveLength(1);
    expect(analysis.uniqueTokenEvents[0]?.last.inputTokens).toBe(100);
    expect(analysis.uniqueTokenEvents[0]?.last.cachedInputTokens).toBe(20);
    expect(analysis.uniqueTokenEvents[0]?.contextWindow).toBe(1000);
  });

  it("excludes duplicate token totals from unique token events", () => {
    const path = writeJsonl([
      token(100, 100, 20),
      token(200, 100, 20),
      token(200, 100, 20),
      token(300, 100, 20),
    ]);
    const analysis = parseSessionFile(path);
    expect(analysis.tokenEvents).toHaveLength(4);
    expect(analysis.uniqueTokenEvents).toHaveLength(3);
    expect(analysis.uniqueTokenEvents.at(-1)?.total.totalTokens).toBe(310);
  });

  it("computes non-cached input and cache hit rate", () => {
    const usage = {
      inputTokens: 100,
      cachedInputTokens: 75,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 100,
    };
    expect(nonCachedInputTokens(usage)).toBe(25);
    expect(cacheHitRate(usage)).toBe(0.75);
    expect(nonCachedInputTokens({ ...usage, inputTokens: 50, cachedInputTokens: 75 })).toBe(0);
    expect(cacheHitRate({ ...usage, inputTokens: 0 })).toBeNull();
  });

  it("joins function_call and function_call_output by call_id", () => {
    const path = writeJsonl([
      token(100, 100, 20),
      {
        timestamp: "t2",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "call_1",
          name: "exec_command",
          arguments: JSON.stringify({ cmd: "rg foo src" }),
        },
      },
      {
        timestamp: "t3",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "call_1", output: "x".repeat(1000) },
      },
      {
        timestamp: "t4",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "call_1", output: "y".repeat(250) },
      },
      token(1500, 1400, 200),
    ]);
    const analysis = parseSessionFile(path);
    expect(analysis.tools[0]?.name).toBe("exec_command");
    expect(analysis.tools[0]?.command).toBe("rg foo src");
    expect(analysis.tools[0]?.outputChars).toBe(1250);
    expect(analysis.intervals.at(-1)?.tools[0]?.outputChars).toBe(1250);
  });

  it("handles custom view_image tools separately from exec commands", () => {
    const path = writeJsonl([
      {
        timestamp: "t1",
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          call_id: "img_1",
          name: "view_image",
          input: { path: "/tmp/a.png" },
        },
      },
      {
        timestamp: "t2",
        type: "response_item",
        payload: { type: "custom_tool_call_output", call_id: "img_1", output: "i".repeat(500) },
      },
      token(1000, 1000, 100),
    ]);
    const analysis = parseSessionFile(path);
    expect(analysis.tools[0]?.name).toBe("view_image");
    expect(analysis.tools[0]?.command).toBe("/tmp/a.png");
    expect(analysis.tools[0]?.outputChars).toBe(500);
  });

  it("detects large events using min chars", () => {
    const path = writeJsonl([
      { timestamp: "t1", type: "event_msg", payload: { type: "user_message", message: "u".repeat(20_000) } },
      { timestamp: "t2", type: "response_item", payload: { type: "message", content: "m".repeat(5_000) } },
      token(1000, 1000, 100),
    ]);
    const analysis = parseSessionFile(path);
    const events = largeEvents(analysis, 10_000, 10);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("event_msg/user_message");
  });

  it("reports compaction impact with before and after token events", () => {
    const path = writeJsonl([
      token(1000, 1000, 100, "before"),
      { timestamp: "compact", type: "compacted", items: ["x".repeat(20_000)] },
      { timestamp: "done", type: "event_msg", payload: { type: "context_compacted" } },
      token(1200, 200, 50, "after"),
    ]);
    const analysis = parseSessionFile(path);
    const impacts = compactionImpacts(analysis, 10);
    expect(impacts[0]?.before?.timestamp).toBe("before");
    expect(impacts[0]?.after?.timestamp).toBe("after");
  });
});
