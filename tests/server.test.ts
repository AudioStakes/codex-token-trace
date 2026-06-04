import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { parseSessionFile } from "../src/parser.js";
import { createServerApp } from "../src/server.js";
import type { EventListResponse, SessionView } from "../src/server-model.js";

const writeJsonl = (rows: Array<Record<string, unknown>>): string => {
  const dir = mkdtempSync(join(tmpdir(), "ctt-server-"));
  const path = join(dir, "rollout-test-session.jsonl");
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  return path;
};

const tokenCount = (
  timestamp: string,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
  reasoningOutputTokens: number,
  totalTokens: number,
  contextWindow: number,
): Record<string, unknown> => ({
  timestamp,
  type: "event_msg",
  payload: {
    type: "token_count",
    info: {
      total_token_usage: {
        input_tokens: inputTokens,
        cached_input_tokens: cachedInputTokens,
        output_tokens: outputTokens,
        reasoning_output_tokens: reasoningOutputTokens,
        total_tokens: totalTokens,
      },
      last_token_usage: {
        input_tokens: inputTokens,
        cached_input_tokens: cachedInputTokens,
        output_tokens: outputTokens,
        reasoning_output_tokens: reasoningOutputTokens,
        total_tokens: totalTokens,
      },
      model_context_window: contextWindow,
    },
  },
});

const fixtureRows = (): Array<Record<string, unknown>> => [
  { timestamp: "2026-05-25T00:00:00Z", type: "session_meta", cwd: "/tmp/synthetic" },
  {
    timestamp: "2026-05-25T00:00:01Z",
    type: "event_msg",
    payload: { type: "user_message", message: "Please inspect the synthetic project" },
  },
  tokenCount("2026-05-25T00:00:02Z", 100, 20, 10, 2, 112, 1000),
  {
    timestamp: "2026-05-25T00:00:03Z",
    type: "response_item",
    payload: { type: "message", role: "assistant", content: "I will inspect it." },
  },
  {
    timestamp: "2026-05-25T00:00:04Z",
    type: "response_item",
    payload: {
      type: "function_call",
      call_id: "call_1",
      name: "exec_command",
      arguments: JSON.stringify({ cmd: "rg todo src" }),
    },
  },
  {
    timestamp: "2026-05-25T00:00:05Z",
    type: "response_item",
    payload: { type: "function_call_output", call_id: "call_1", output: "todo output" },
  },
  {
    timestamp: "2026-05-25T00:00:06Z",
    type: "response_item",
    payload: { type: "reasoning", content: "Need a small patch." },
  },
  {
    timestamp: "2026-05-25T00:00:07Z",
    type: "response_item",
    payload: {
      type: "custom_tool_call",
      call_id: "patch_1",
      input: "*** Begin Patch\n*** End Patch",
    },
  },
  { timestamp: "2026-05-25T00:00:08Z", type: "compacted", items: ["synthetic"] },
  {
    timestamp: "2026-05-25T00:00:08.500Z",
    type: "event_msg",
    payload: { type: "context_compacted" },
  },
  tokenCount("2026-05-25T00:00:09Z", 250, 50, 40, 4, 294, 1000),
];

const fixtureApp = () => createServerApp(parseSessionFile(writeJsonl(fixtureRows())));

const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

describe("serve command and server app", () => {
  it("prints serve in CLI help", () => {
    const logs: string[] = [];
    const original = console.log;
    console.log = (value?: unknown) => {
      logs.push(String(value));
    };
    try {
      expect(run(["--help"])).toBe(0);
    } finally {
      console.log = original;
    }
    expect(logs.join("\n")).toContain(
      "codex-token-trace serve [paths...] [--session text] [--port n]",
    );
  });

  it("returns HTML for GET /", async () => {
    const response = await fixtureApp().request("/");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Session timeline explorer");
  });

  it("renders marker kinds with separate legend labels and drawing logic", async () => {
    const response = await fixtureApp().request("/");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("compaction</span>");
    expect(html).toContain("tool usage group</span>");
    expect(html).toContain("large event</span>");
    expect(html).not.toContain(">markers</span>");
    expect(html).toContain("marker.kind === 'compaction'");
    expect(html).toContain("marker.kind === 'tool_usage_group'");
    expect(html).toContain("marker.value");
    expect(html).toContain("marker.kind === 'large_event'");
  });

  it("renders the pressure graph with timestamp-based x coordinates and line fallback", async () => {
    const response = await fixtureApp().request("/");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("timestampRange");
    expect(html).toContain("Date.parse");
    expect(html).toContain("pointX(point, index)");
    expect(html).toContain("markerX(marker)");
    expect(html).toContain("value === null");
  });

  it("returns session summary and normalized pressure series", async () => {
    const response = await fixtureApp().request("/api/session");
    expect(response.status).toBe(200);
    const data = await json<SessionView>(response);
    expect(data.summary).toEqual(
      expect.objectContaining({
        finalTotalTokens: 294,
        finalInputTokens: 250,
        finalCachedInputTokens: 50,
        finalOutputTokens: 40,
        finalReasoningOutputTokens: 4,
        maxInputTokens: 250,
        maxNonCachedInputTokens: 200,
        maxContextUsageRatio: 0.25,
        compactionCount: 1,
      }),
    );
    expect(data.pressureSeries.at(-1)).toEqual(
      expect.objectContaining({
        line: 11,
        totalProgress: 100,
        contextPressure: 25,
        nonCachedPressure: 100,
        nonCachedInputTokens: 200,
      }),
    );
    expect(data.markers.map((marker) => marker.kind)).toContain("compaction");
    expect(data.markers.map((marker) => marker.kind)).toContain("tool_usage_group");
  });

  it("returns preview-only event list and classified event kinds", async () => {
    const response = await fixtureApp().request("/api/events");
    expect(response.status).toBe(200);
    const data = await json<EventListResponse>(response);
    expect(data.total).toBe(11);
    expect(data.events).toHaveLength(11);
    expect(data.events.map((event) => event.kind)).toEqual([
      "session_meta",
      "user_message",
      "token_count",
      "assistant_message",
      "tool_call",
      "tool_output",
      "reasoning",
      "apply_patch",
      "compaction",
      "compaction",
      "token_count",
    ]);
    expect(data.events[1]).toEqual(
      expect.objectContaining({ preview: "Please inspect the synthetic project" }),
    );
    expect(data.events[1]).not.toHaveProperty("raw");
    expect(data.events[1]).not.toHaveProperty("extracted");
  });

  it("paginates event lists", async () => {
    const response = await fixtureApp().request("/api/events?offset=0&limit=1");
    expect(response.status).toBe(200);
    const data = await json<EventListResponse>(response);
    expect(data.total).toBe(11);
    expect(data.offset).toBe(0);
    expect(data.limit).toBe(1);
    expect(data.events).toHaveLength(1);
    expect(data.events[0]?.line).toBe(1);
  });

  it("returns event detail with raw JSON and extracted exec_command cmd", async () => {
    const response = await fixtureApp().request("/api/events/5");
    expect(response.status).toBe(200);
    const data = await json<Record<string, unknown>>(response);
    expect(data).toEqual(
      expect.objectContaining({
        line: 5,
        kind: "tool_call",
        rawChars: expect.any(Number),
        raw: expect.any(Object),
      }),
    );
    expect(data.extracted).toEqual(
      expect.objectContaining({
        callId: "call_1",
        name: "exec_command",
        command: "rg todo src",
      }),
    );
  });

  it("returns 404 JSON for missing detail lines", async () => {
    const response = await fixtureApp().request("/api/events/999");
    expect(response.status).toBe(404);
    expect(await json<Record<string, unknown>>(response)).toEqual({
      error: "Event line not found",
    });
  });
});
