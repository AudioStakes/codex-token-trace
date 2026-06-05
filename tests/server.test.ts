import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { parseSessionFile } from "../src/parser.js";
import { createServerApp } from "../src/server.js";
import type {
  EventListResponse,
  SessionsOverviewResponse,
  SessionView,
} from "../src/server-model.js";

const writeJsonl = (rows: Array<Record<string, unknown>>): string => {
  const dir = mkdtempSync(join(tmpdir(), "ctt-server-"));
  const path = join(dir, "rollout-test-session.jsonl");
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  return path;
};

const assertModuleParses = (script: string): void => {
  const dir = mkdtempSync(join(tmpdir(), "ctt-overview-script-"));
  const path = join(dir, "overview.mjs");
  writeFileSync(path, script, "utf8");
  const result = spawnSync("node", ["--check", path], { encoding: "utf8" });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
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
      last_token_usage: {
        input_tokens: inputTokens,
        cached_input_tokens: cachedInputTokens,
        output_tokens: outputTokens,
        reasoning_output_tokens: reasoningOutputTokens,
      },
      total_token_usage: {
        input_tokens: inputTokens,
        cached_input_tokens: cachedInputTokens,
        output_tokens: outputTokens,
        reasoning_output_tokens: reasoningOutputTokens,
        total_tokens: totalTokens,
      },
      context_window: contextWindow,
    },
  },
});

const sessionARows = (): Array<Record<string, unknown>> => [
  { timestamp: "2026-05-25T00:00:00Z", type: "session_meta", cwd: "/tmp/synthetic-a" },
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

const sessionBRows = (): Array<Record<string, unknown>> => [
  { timestamp: "2026-05-25T01:00:00Z", type: "session_meta", cwd: "/tmp/synthetic-b" },
  {
    timestamp: "2026-05-25T01:00:01Z",
    type: "event_msg",
    payload: { type: "user_message", message: "Plan the refactor" },
  },
  tokenCount("2026-05-25T01:00:02Z", 100, 20, 40, 10, 60, 1000),
  {
    timestamp: "2026-05-25T01:00:03Z",
    type: "response_item",
    payload: { type: "message", role: "assistant", content: "I need a bit more context." },
  },
  {
    timestamp: "2026-05-25T01:00:04Z",
    type: "response_item",
    payload: {
      type: "function_call",
      call_id: "call_2",
      name: "exec_command",
      arguments: JSON.stringify({ cmd: "pnpm test" }),
    },
  },
  {
    timestamp: "2026-05-25T01:00:05Z",
    type: "response_item",
    payload: { type: "function_call_output", call_id: "call_2", output: "test output" },
  },
  { timestamp: "2026-05-25T01:00:06Z", type: "compacted", items: ["synthetic"] },
  tokenCount("2026-05-25T01:00:07Z", 100, 20, 40, 10, 60, 1000),
];

const sessionCRows = (): Array<Record<string, unknown>> => [
  { timestamp: "2026-05-25T02:00:00Z", type: "session_meta", cwd: "/tmp/synthetic-c" },
  {
    timestamp: "2026-05-25T02:00:01Z",
    type: "event_msg",
    payload: { type: "user_message", message: "Investigate heavy context" },
  },
  tokenCount("2026-05-25T02:00:02Z", 250, 50, 40, 4, 294, 1000),
  {
    timestamp: "2026-05-25T02:00:03Z",
    type: "response_item",
    payload: { type: "message", role: "assistant", content: "I will inspect the trace." },
  },
  {
    timestamp: "2026-05-25T02:00:04Z",
    type: "response_item",
    payload: {
      type: "function_call",
      call_id: "call_3",
      name: "exec_command",
      arguments: JSON.stringify({ cmd: "cargo test" }),
    },
  },
  {
    timestamp: "2026-05-25T02:00:05Z",
    type: "response_item",
    payload: { type: "function_call_output", call_id: "call_3", output: "cargo output" },
  },
  {
    timestamp: "2026-05-25T02:00:06Z",
    type: "response_item",
    payload: { type: "reasoning", content: "Need one more token_count sample." },
  },
  { timestamp: "2026-05-25T02:00:07Z", type: "compacted", items: ["synthetic"] },
  tokenCount("2026-05-25T02:00:08Z", 250, 50, 40, 4, 294, 1000),
];

const fixtureApp = () => createServerApp(parseSessionFile(writeJsonl(sessionARows())));

const overviewApp = () => {
  const alpha = parseSessionFile(writeJsonl(sessionARows()));
  const beta = parseSessionFile(writeJsonl(sessionBRows()));
  const gamma = parseSessionFile(writeJsonl(sessionCRows()));
  return createServerApp(alpha, [alpha, beta, gamma]);
};
const betaFocusedApp = () => {
  const alpha = parseSessionFile(writeJsonl(sessionARows()));
  const beta = parseSessionFile(writeJsonl(sessionBRows()));
  const gamma = parseSessionFile(writeJsonl(sessionCRows()));
  return createServerApp(beta, [alpha, beta, gamma]);
};

const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

describe("serve command and server app", () => {
  it("prints serve in CLI help", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (value?: unknown) => {
      logs.push(String(value));
    };

    try {
      await run(["serve", "--help"]);
    } finally {
      console.log = originalLog;
    }

    expect(logs.join("\n")).toContain("serve");
  });

  it("returns HTML for GET /", async () => {
    const response = await fixtureApp().request("/");
    expect(response.status).toBe(200);

    const html = await response.text();
    expect(html).toContain("Session timeline explorer");
    expect(html).toContain("Open multi-session overview");
    expect(html).toContain("<style>");
    expect(html).toContain("<script>");
    expect(html).toContain(".tooltip");
  });

  it("returns HTML for GET /overview", async () => {
    const response = await overviewApp().request("/overview");
    expect(response.status).toBe(200);

    const html = await response.text();
    expect(html).toContain("Multi-session overview");
    expect(html).toContain("chart-footer");
  expect(html).toContain('<script type="module" src="/assets/overview-client.js"></script>');
  expect(html).not.toContain("<script>");
    expect(html).toContain("<style>");
    expect(html).toContain('id="chart-spacer"');
    expect(html).toContain('id="chart-error"');
    expect(html).toContain('id="ranking-body"');
    expect(html).toContain('id="tooltip"');
    expect(html).toContain('type="range"');
    expect(html).toContain("time scale");
    expect(html).toContain("non-cached input");
    expect(html).toContain("top command preview");
    expect(html).not.toContain('id="detail"');
    expect(html).toContain(".legend");
    expect(html).toContain("visible-in-chart");
    expect(html).toContain("hovered-session");
    expect(html).toContain("sort(");
    expect(html).toContain("(b.finalTotalTokens ?? 0) - (a.finalTotalTokens ?? 0)");
    expect(html).toContain("const domainStart = start - marginMs;");
    expect(html).toContain("const domainEnd = end + marginMs;");
    expect(html).toMatch(
      /const tickHours =\s+state\.pxPerHour <= 10 \? 24 : state\.pxPerHour <= 16 \? 12 : state\.pxPerHour <= 28 \? 6 : 3;/,
    );
    expect(html).toContain("ctx.fillText(formatTickLabel(time), x, topPad + plotHeight + 18);");
    expect(html).toContain("adjustment");
    expect(html).toContain("median/session");
    expect(html).toContain("sessions with compaction");

    const assetResponse = await overviewApp().request("/assets/overview-client.js");
  expect(assetResponse.status).toBe(200);
  expect(assetResponse.headers.get("content-type")).toContain("text/javascript; charset=utf-8");

  const script = await assetResponse.text();
  assertModuleParses(script);
  expect(script).toContain("renderChart");
  expect(script).toContain("const parseTime = (timestamp) =>");
  expect(script).toContain("Failed to render chart:");
  expect(script).toContain("chart.width = Math.round(viewportWidth * dpr);");
    expect(script).toContain("const scrollLeft = Math.max(0, scrollArea.scrollLeft);");
    expect(script).toContain("scrollArea.addEventListener('scroll', scheduleRenderChart);");
    expect(script).toContain("window.addEventListener('resize', scheduleRenderChart);");
    expect(script).toContain("if (viewportWidth <= 0 || chartHeight <= 0) {");
    expect(script).not.toContain("chart.width = Math.round(chartWidth * dpr);");
    expect(script).toContain("visible-in-chart");
    expect(script).toContain("hovered-session");
    expect(script).toContain("scrollIntoView({ block: 'nearest' });");
    expect(script).toContain("/?session=");
    expect(script).toContain(
      "const displayPath = (path) => String(path).replace(/^\\/Users\\/satoudaisuke(?=\\/|$)/, '~');",
    );
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
        compactionCount: 1,
      }),
    );
    expect(data.timelineLaneEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lane: "user", kind: "user_message" }),
        expect.objectContaining({ lane: "status", kind: "assistant_message" }),
        expect.objectContaining({ lane: "tool", kind: "tool_call" }),
        expect.objectContaining({ lane: "tool", kind: "tool_output" }),
        expect.objectContaining({ lane: "token", kind: "token_count" }),
        expect.objectContaining({ lane: "compaction", kind: "compaction" }),
      ]),
    );
  });

  it("treats blank session query as omitted", async () => {
    const response = await betaFocusedApp().request("/api/session?session=");
    expect(response.status).toBe(200);

    const data = await json<SessionView>(response);
    expect(data.summary.finalTotalTokens).toBe(60);

    const whitespaceResponse = await betaFocusedApp().request("/api/session?session=%20%20");
    expect(whitespaceResponse.status).toBe(200);

    const whitespaceData = await json<SessionView>(whitespaceResponse);
    expect(whitespaceData.summary.finalTotalTokens).toBe(60);
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
      expect.objectContaining({
        preview: "Please inspect the synthetic project",
        kind: "user_message",
      }),
    );
    expect(data.events[4]).toEqual(
      expect.objectContaining({
        preview: '{"cmd":"rg todo src"}',
        kind: "tool_call",
        title: "exec_command",
      }),
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

  it("keeps detail loading hooks for event list rows and event lane clicks", async () => {
    const response = await fixtureApp().request("/");
    expect(response.status).toBe(200);

    const html = await response.text();
    expect(html).toContain("loadDetail(row.dataset.line)");
    expect(html).toContain("setGraphPointDetail(hit)");
  });

  it("returns event detail with raw JSON and extracted exec_command cmd", async () => {
    const response = await fixtureApp().request("/api/events/5");
    expect(response.status).toBe(200);

    const data = await json<Record<string, unknown>>(response);
    expect(data).toEqual(
      expect.objectContaining({
        line: 5,
        kind: "tool_call",
        extracted: expect.objectContaining({
          command: "rg todo src",
        }),
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

  it("returns an overview summary for GET /api/sessions/overview", async () => {
    const response = await overviewApp().request("/api/sessions/overview");
    expect(response.status).toBe(200);

    const data = await json<SessionsOverviewResponse>(response);
    expect(data.summary).toEqual(
      expect.objectContaining({
        sessions: 3,
        totalTokens: 648,
        medianTotalTokens: 294,
        maxEvents: 11,
        sessionsWithCompaction: 3,
        startedAt: "2026-05-25T00:00:00.000Z",
        endedAt: "2026-05-25T02:00:08.000Z",
      }),
    );
    expect(data.sessions).toHaveLength(3);
    expect(data.sessions.every((session) => session.events > 0)).toBe(true);
    expect(data.sessions.some((session) => session.compactions > 0)).toBe(true);
    expect(data.sessions[0]).not.toHaveProperty("raw");
    expect(data.sessions[0]).not.toHaveProperty("extracted");
    expect(data.sessions[0]).toHaveProperty("knownBreakdownTokens");
  });

  it("calculates overview breakdown fields from the reported token counts", async () => {
    const response = await overviewApp().request("/api/sessions/overview");
    const data = await json<SessionsOverviewResponse>(response);

    const alpha = data.sessions[0];
    const beta = data.sessions[1];
    const gamma = data.sessions[2];

    expect(alpha).toMatchObject({
      finalTotalTokens: 294,
      knownBreakdownTokens: 290,
      finalInputTokens: 250,
      finalCachedInputTokens: 50,
      finalOutputTokens: 40,
      finalReasoningOutputTokens: 4,
      nonCachedInputTokens: 200,
      visibleOutputTokens: 36,
      adjustmentTokens: 4,
      breakdownMismatchTokens: 4,
      events: 11,
      compactions: 1,
    });
    expect(beta).toMatchObject({
      finalTotalTokens: 60,
      knownBreakdownTokens: 140,
      nonCachedInputTokens: 80,
      visibleOutputTokens: 30,
      adjustmentTokens: 0,
      breakdownMismatchTokens: -80,
      events: 8,
      compactions: 1,
    });
    expect(gamma).toMatchObject({
      finalTotalTokens: 294,
      knownBreakdownTokens: 290,
      nonCachedInputTokens: 200,
      visibleOutputTokens: 36,
      adjustmentTokens: 4,
      breakdownMismatchTokens: 4,
      events: 9,
      compactions: 1,
    });
  });
});
