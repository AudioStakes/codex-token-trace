import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cacheHitRate,
  finalTotal,
  isExecCommand,
  nonCachedInputTokens,
  topIntervalEventTypes,
} from "../src/models.js";
import { parseSessionFile } from "../src/parser.js";
import {
  compactionImpacts,
  largeEvents,
  sessionToJson,
  toolOutputTable,
  toolUsageTable,
} from "../src/reports.js";

const writeJsonl = (rows: Array<Record<string, unknown>>): string => {
  const dir = mkdtempSync(join(tmpdir(), "ctt-"));
  const path = join(dir, "session.jsonl");
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  return path;
};

const token = (
  total: number,
  input: number,
  cached: number,
  timestamp = "2026-01-01T00:00:00Z",
) => ({
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

const message = (timestamp: string, chars: number, type = "user_message") => ({
  timestamp,
  type: "event_msg",
  payload: { type, message: "m".repeat(chars) },
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
    expect(analysis.uniqueTokenEvents[0]?.last.outputTokens).toBe(10);
    expect(analysis.uniqueTokenEvents[0]?.last.reasoningOutputTokens).toBe(2);
    expect(analysis.uniqueTokenEvents[0]?.total.totalTokens).toBe(110);
    expect(analysis.uniqueTokenEvents[0]?.contextWindow).toBe(1000);
  });

  it("excludes duplicate token totals from unique token events and final totals", () => {
    const path = writeJsonl([
      token(100, 100, 20),
      token(200, 100, 20),
      token(200, 100, 20),
      token(300, 100, 20),
    ]);
    const analysis = parseSessionFile(path);
    expect(analysis.tokenEvents).toHaveLength(4);
    expect(analysis.tokenEvents[2]?.duplicateTotal).toBe(true);
    expect(analysis.uniqueTokenEvents).toHaveLength(3);
    expect(analysis.intervals).toHaveLength(3);
    expect(finalTotal(analysis).totalTokens).toBe(310);
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
      {
        timestamp: "t5",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "missing", output: "z".repeat(25) },
      },
      {
        timestamp: "t6",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "call_no_output",
          name: "exec_command",
          arguments: JSON.stringify({ cmd: "pwd" }),
        },
      },
      token(1500, 1400, 200),
    ]);
    const analysis = parseSessionFile(path);
    const command = analysis.tools.find((tool) => tool.callId === "call_1");
    const missing = analysis.tools.find((tool) => tool.callId === "missing");
    const noOutput = analysis.tools.find((tool) => tool.callId === "call_no_output");
    expect(command?.name).toBe("exec_command");
    expect(command?.command).toBe("rg foo src");
    expect(command?.outputChars).toBe(1250);
    expect(missing?.outputChars).toBe(25);
    expect(noOutput?.outputChars).toBe(0);
    expect(
      analysis.intervals.at(-1)?.tools.find((tool) => tool.callId === "call_1")?.outputChars,
    ).toBe(1250);
  });

  it("builds tool usages with summed outputs and next unique token counts", () => {
    const path = writeJsonl([
      token(100, 100, 20, "before"),
      {
        timestamp: "call",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "call_1",
          name: "exec_command",
          arguments: JSON.stringify({ cmd: "rg foo src" }),
        },
      },
      {
        timestamp: "out-1",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "call_1", output: "x".repeat(100) },
      },
      {
        timestamp: "out-2",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "call_1", output: "y".repeat(50) },
      },
      token(200, 180, 40, "next"),
      token(200, 180, 40, "duplicate"),
      {
        timestamp: "patch-call",
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          call_id: "patch_1",
          input: "*** Begin Patch\n*** End Patch",
        },
      },
      {
        timestamp: "patch-out",
        type: "response_item",
        payload: { type: "custom_tool_call_output", call_id: "patch_1", output: "Done!" },
      },
      token(300, 250, 100, "next-after-duplicate"),
    ]);
    const analysis = parseSessionFile(path);
    const usage = analysis.toolUsages.find((tool) => tool.callId === "call_1");
    const patch = analysis.toolUsages.find((tool) => tool.callId === "patch_1");
    expect(usage).toEqual(
      expect.objectContaining({
        name: "exec_command",
        outputChars: 150,
        outputEvents: 2,
        startLine: 2,
        endLine: 4,
        nextTokenLine: 5,
        nextTokenTime: "next",
        nextInputTokens: 180,
        nextCachedInputTokens: 40,
        nextNonCachedInputTokens: 140,
        nextOutputTokens: 10,
        nextTotalTokens: 210,
      }),
    );
    expect(patch).toEqual(
      expect.objectContaining({
        name: "apply_patch",
        nextTokenLine: 9,
        nextNonCachedInputTokens: 150,
      }),
    );
  });

  it("builds tool usages for orphan outputs and calls without following token counts", () => {
    const path = writeJsonl([
      {
        timestamp: "orphan-output",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "orphan", output: "orphan" },
      },
      token(100, 100, 20, "after-orphan"),
      {
        timestamp: "lonely-call",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "lonely",
          name: "exec_command",
          arguments: JSON.stringify({ cmd: "pwd" }),
        },
      },
    ]);
    const analysis = parseSessionFile(path);
    const orphan = analysis.toolUsages.find((tool) => tool.callId === "orphan");
    const lonely = analysis.toolUsages.find((tool) => tool.callId === "lonely");
    expect(orphan).toEqual(
      expect.objectContaining({
        startLine: null,
        endLine: 1,
        outputChars: 6,
        nextTokenLine: 2,
      }),
    );
    expect(lonely).toEqual(
      expect.objectContaining({
        outputChars: 0,
        startLine: 3,
        endLine: null,
        nextTokenLine: null,
        nextNonCachedInputTokens: null,
      }),
    );
    expect(toolUsageTable(analysis.toolUsages, 10)).toContain("next_new_input");
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
    expect(analysis.tools[0] && isExecCommand(analysis.tools[0])).toBe(false);
    expect(toolOutputTable(analysis.tools, 10, true)).not.toContain("view_image");
  });

  it("attributes intervals between unique token counts and ignores duplicates as boundaries", () => {
    const path = writeJsonl([
      token(100, 100, 20, "first"),
      message("large", 600, "user_message"),
      token(200, 100, 20, "second"),
      message("medium", 300, "assistant_message"),
      token(200, 100, 20, "duplicate"),
      message("small", 100, "patch_apply_end"),
      token(300, 100, 20, "third"),
    ]);
    const analysis = parseSessionFile(path);
    expect(analysis.intervals).toHaveLength(3);
    expect(analysis.intervals[1]?.tokenEvent.timestamp).toBe("second");
    expect(analysis.intervals[1]?.eventCount).toBe(1);
    expect(analysis.intervals[2]?.previousTokenLine).toBe(3);
    expect(analysis.intervals[2]?.eventCount).toBe(3);
    const thirdInterval = analysis.intervals[2];
    if (thirdInterval === undefined) {
      throw new Error("Expected a third interval");
    }
    const topTypes = topIntervalEventTypes(thirdInterval, 3);
    expect(topTypes[0]?.rawChars).toBeGreaterThanOrEqual(topTypes[1]?.rawChars ?? 0);
    expect(topTypes.map((row) => row.eventType)).toContain("event_msg/token_count");
  });

  it("detects large events using min chars, sorts by raw chars, and truncates previews", () => {
    const path = writeJsonl([
      {
        timestamp: "t1",
        type: "event_msg",
        payload: { type: "user_message", message: "u".repeat(20_000) },
      },
      {
        timestamp: "t2",
        type: "response_item",
        payload: { type: "message", content: "m".repeat(15_000) },
      },
      token(1000, 1000, 100),
    ]);
    const analysis = parseSessionFile(path);
    const events = largeEvents(analysis, 10_000, 10);
    expect(events).toHaveLength(2);
    expect(events[0]?.rawChars).toBeGreaterThan(events[1]?.rawChars ?? 0);
    expect(events[0]?.eventType).toBe("event_msg/user_message");
    expect(events[0]?.preview.length).toBeLessThanOrEqual(120);
    expect(largeEvents(analysis, 30_000, 10)).toHaveLength(0);
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
    expect(impacts).toHaveLength(2);
    expect(impacts[0]?.eventType).toBe("compacted/no_payload_type");
    expect(impacts[0]?.before?.timestamp).toBe("before");
    expect(impacts[0]?.after?.timestamp).toBe("after");
    expect(impacts[1]?.eventType).toBe("event_msg/context_compacted");
  });

  it("reports compaction impact without before or after token events", () => {
    const path = writeJsonl([{ timestamp: "compact", type: "compacted", items: ["synthetic"] }]);
    const analysis = parseSessionFile(path);
    const impacts = compactionImpacts(analysis, 10);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]?.before).toBeNull();
    expect(impacts[0]?.after).toBeNull();
  });

  it("serializes stable numeric analyze JSON sections", () => {
    const path = writeJsonl([
      {
        timestamp: "t1",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "call_1",
          name: "exec_command",
          arguments: JSON.stringify({ cmd: "printf synthetic" }),
        },
      },
      {
        timestamp: "t2",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "call_1", output: "x".repeat(100) },
      },
      { timestamp: "compact", type: "compacted", items: ["x".repeat(12_000)] },
      token(1000, 1000, 100, "after"),
    ]);
    const json = sessionToJson(parseSessionFile(path));
    expect(typeof json.events).toBe("number");
    expect(typeof json.toolOutputChars).toBe("number");
    expect(json).toHaveProperty("drivers");
    expect(json).toHaveProperty("heaviestTools");
    expect(json).toHaveProperty("toolUsages");
    expect(json).toHaveProperty("intervals");
    expect(json).toHaveProperty("largeEvents");
    expect(json).toHaveProperty("compactions");
    expect(json.heaviestTools).toEqual(
      expect.arrayContaining([expect.objectContaining({ tool: "exec_command", outputChars: 100 })]),
    );
    expect(json.toolUsages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: "exec_command",
          outputChars: 100,
          nextNonCachedInputTokens: 900,
        }),
      ]),
    );
  });
});
