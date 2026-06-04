import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run } from "../src/cli.js";

const fixturePath = (name: string): string => join(process.cwd(), "tests", "fixtures", name);

const tokenRow = (totalTokens: number, timestamp: string) => ({
  timestamp,
  type: "event_msg",
  payload: {
    type: "token_count",
    info: {
      total_token_usage: {
        input_tokens: totalTokens,
        cached_input_tokens: 0,
        output_tokens: 0,
        reasoning_output_tokens: 0,
        total_tokens: totalTokens,
      },
      last_token_usage: {
        input_tokens: totalTokens,
        cached_input_tokens: 0,
        output_tokens: 0,
        reasoning_output_tokens: 0,
        total_tokens: totalTokens,
      },
      model_context_window: 1000,
    },
  },
});

const writeJsonl = (dir: string, name: string, rows: Array<Record<string, unknown>>): string => {
  const path = join(dir, name);
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  return path;
};

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

const toolCallRows = (
  callId: string,
  name: string,
  input: Record<string, unknown> | string,
  output: string,
): Array<Record<string, unknown>> => [
  {
    timestamp: `${callId}-call`,
    type: "response_item",
    payload: {
      type: "function_call",
      call_id: callId,
      name,
      arguments: typeof input === "string" ? input : JSON.stringify(input),
    },
  },
  {
    timestamp: `${callId}-output`,
    type: "response_item",
    payload: { type: "function_call_output", call_id: callId, output },
  },
];

const patchRows = (callId: string): Array<Record<string, unknown>> => [
  {
    timestamp: `${callId}-call`,
    type: "response_item",
    payload: {
      type: "custom_tool_call",
      call_id: callId,
      input: "*** Begin Patch\n*** End Patch",
    },
  },
  {
    timestamp: `${callId}-output`,
    type: "response_item",
    payload: { type: "custom_tool_call_output", call_id: callId, output: "Done!" },
  },
];

const diagnoseOutputForRows = (rows: Array<Record<string, unknown>>, limit = "10"): string => {
  const dir = mkdtempSync(join(tmpdir(), "ctt-cli-diagnose-signals-"));
  const path = writeJsonl(dir, "session.jsonl", rows);
  const { code, output } = captureLog(() => run(["diagnose", "--limit", limit, path]));
  expect(code).toBe(0);
  return output;
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
    expect(parsed.session).toHaveProperty("toolUsages");
    expect(parsed.session).toHaveProperty("toolUsageGroups");
    expect(parsed.session).toHaveProperty("intervals");
    expect(parsed.session).toHaveProperty("largeEvents");
    expect(parsed.session).toHaveProperty("compactions");
  });

  it("runs diagnose against a synthetic fixture", () => {
    const { code, output } = captureLog(() =>
      run(["diagnose", "--limit", "2", fixturePath("diagnose-session.jsonl")]),
    );

    expect(code).toBe(0);
    expect(output).toContain("# Diagnosis");
    expect(output).toContain("Raw log size is likely dominated by");
    expect(output).toContain("function_call_output");
    expect(output).toContain("Tool output size is likely dominated by view_image");
    expect(output).toContain("Non-cached input spikes are associated with");
    expect(output).toContain("after apply_patch");
    expect(output).toContain("after 2 tools");
    expect(output).toContain("Context compaction happened 1 time, max compacted event 955 chars.");
  });

  it("suggests view_image only when image output is a large observed signal", () => {
    const imageSuggestion =
      "Use view_image intentionally; it is output-size heavy even when next_new_input is low.";

    const withImage = diagnoseOutputForRows([
      tokenRow(100, "start"),
      ...toolCallRows("image", "view_image", { path: "/tmp/synthetic.png" }, "v".repeat(900)),
      ...toolCallRows("exec", "exec_command", { cmd: "pwd" }, "x".repeat(100)),
      tokenRow(200, "after"),
    ]);
    expect(withImage).toContain(imageSuggestion);

    const withoutImage = diagnoseOutputForRows([
      tokenRow(100, "start"),
      ...toolCallRows("exec", "exec_command", { cmd: "pwd" }, "x".repeat(1000)),
      tokenRow(200, "after"),
    ]);
    expect(withoutImage).not.toContain(imageSuggestion);
  });

  it("suggests narrowing rg/sed only when those commands are prominent", () => {
    const rgSedSuggestion = "Narrow broad rg/sed commands before reading large outputs.";

    const withRgSed = diagnoseOutputForRows([
      tokenRow(100, "start"),
      ...toolCallRows("rg", "exec_command", { cmd: "rg broad src" }, "r".repeat(800)),
      ...toolCallRows("sed", "exec_command", { cmd: "sed -n 1,200p src/file.ts" }, "s".repeat(500)),
      tokenRow(600, "after"),
    ]);
    expect(withRgSed).toContain(rgSedSuggestion);

    const withoutRgSed = diagnoseOutputForRows([
      tokenRow(100, "start"),
      ...toolCallRows("cat", "exec_command", { cmd: "cat package.json" }, "c".repeat(800)),
      tokenRow(600, "after"),
    ]);
    expect(withoutRgSed).not.toContain(rgSedSuggestion);
  });

  it("suggests avoiding generated asset reads only when generated paths are observed", () => {
    const generatedAssetSuggestion = "Avoid repeated reads of generated assets unless necessary.";

    const withGeneratedAsset = diagnoseOutputForRows([
      tokenRow(100, "start"),
      ...toolCallRows(
        "asset",
        "exec_command",
        { cmd: "sed -n 1,80p dist/assets/app.js" },
        "a".repeat(800),
      ),
      tokenRow(600, "after"),
    ]);
    expect(withGeneratedAsset).toContain(generatedAssetSuggestion);

    const withoutGeneratedAsset = diagnoseOutputForRows([
      tokenRow(100, "start"),
      ...toolCallRows(
        "source",
        "exec_command",
        { cmd: "sed -n 1,80p src/app.ts" },
        "s".repeat(800),
      ),
      tokenRow(600, "after"),
    ]);
    expect(withoutGeneratedAsset).not.toContain(generatedAssetSuggestion);
  });

  it("suggests reviewing patch intervals only when multiple apply_patch spikes are observed", () => {
    const patchSuggestion =
      "Review large patch intervals; patches can be associated with high non-cached input even when patch output is small.";

    const withMultiplePatchSpikes = diagnoseOutputForRows([
      tokenRow(100, "start"),
      ...patchRows("patch-a"),
      tokenRow(1000, "after-patch-a"),
      ...patchRows("patch-b"),
      tokenRow(1800, "after-patch-b"),
    ]);
    expect(withMultiplePatchSpikes).toContain(patchSuggestion);

    const withOnePatchSpike = diagnoseOutputForRows([
      tokenRow(100, "start"),
      ...patchRows("patch-a"),
      tokenRow(1000, "after-patch-a"),
    ]);
    expect(withOnePatchSpike).not.toContain(patchSuggestion);
  });

  it("suggests context pressure only when compaction is observed", () => {
    const compactionSuggestion =
      "Watch context pressure; compaction indicates the session reached a large context state.";

    const withCompaction = diagnoseOutputForRows([
      tokenRow(100, "start"),
      { timestamp: "compact", type: "compacted", items: ["c".repeat(100)] },
      tokenRow(200, "after"),
    ]);
    expect(withCompaction).toContain(compactionSuggestion);

    const withoutCompaction = diagnoseOutputForRows([
      tokenRow(100, "start"),
      ...toolCallRows("exec", "exec_command", { cmd: "pwd" }, "p".repeat(10)),
      tokenRow(200, "after"),
    ]);
    expect(withoutCompaction).not.toContain(compactionSuggestion);
  });

  it("uses the fallback suggestion only when no specific diagnosis signals are observed", () => {
    const fallbackSuggestion =
      "Inspect the top tool usage groups and large events before optimizing prompts or commands.";

    const withoutSignals = diagnoseOutputForRows([
      tokenRow(100, "start"),
      ...toolCallRows("exec", "exec_command", { cmd: "pwd" }, "p".repeat(10)),
      tokenRow(200, "after"),
    ]);
    expect(withoutSignals).toContain(fallbackSuggestion);

    const withSignal = diagnoseOutputForRows([
      tokenRow(100, "start"),
      { timestamp: "compact", type: "compacted", items: ["c".repeat(100)] },
      tokenRow(200, "after"),
    ]);
    expect(withSignal).not.toContain(fallbackSuggestion);
  });

  it("runs tool-usage against a synthetic fixture", () => {
    const { code, output } = captureLog(() =>
      run(["tool-usage", fixturePath("tool-usage-session.jsonl")]),
    );
    expect(code).toBe(0);
    expect(output).toContain("# Tool usage impact");
    expect(output).toContain("exec_command");
    expect(output).toContain('rg -n "tts-check" dist');
    expect(output).toContain("apply_patch");
    expect(output).toContain("next_new_input");
    expect(output).toContain("next_new_ratio");
  });

  it("runs grouped tool-usage by next token", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctt-cli-grouped-tool-usage-"));
    const path = writeJsonl(dir, "grouped-session.jsonl", [
      {
        timestamp: "tool-a-call",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "tool_a",
          name: "exec_command",
          arguments: JSON.stringify({ cmd: "sed -n 1,20p src/a.ts" }),
        },
      },
      {
        timestamp: "tool-a-output",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "tool_a", output: "a".repeat(12) },
      },
      {
        timestamp: "tool-b-call",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "tool_b",
          name: "exec_command",
          arguments: JSON.stringify({ cmd: "rg grouped src" }),
        },
      },
      {
        timestamp: "tool-b-output",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "tool_b", output: "b".repeat(34) },
      },
      tokenRow(500, "shared-token"),
    ]);

    const { code, output } = captureLog(() =>
      run(["tool-usage", "--group-by", "next-token", path]),
    );

    expect(code).toBe(0);
    expect(output).toContain("# Tool usage groups by next token_count");
    expect(output).toContain("next_new_input");
    expect(output).toContain("token_line");
    expect(output).toContain("tools");
    expect(output).toContain("46");
    expect(output).toContain("exec_command: rg grouped src");
  });

  it("sorts tool usage by output chars or next new input", () => {
    const byOutput = captureLog(() =>
      run(["tool-usage", "--sort", "output-chars", fixturePath("tool-usage-session.jsonl")]),
    );
    expect(byOutput.code).toBe(0);
    expect(byOutput.output.indexOf("exec_command")).toBeLessThan(
      byOutput.output.indexOf("apply_patch"),
    );

    const byNextNewInput = captureLog(() =>
      run(["tool-usage", "--sort", "next-new-input", fixturePath("tool-usage-session.jsonl")]),
    );
    expect(byNextNewInput.code).toBe(0);
    expect(byNextNewInput.output.indexOf("function_call_output")).toBeLessThan(
      byNextNewInput.output.indexOf("apply_patch"),
    );
    expect(byNextNewInput.output.indexOf("apply_patch")).toBeLessThan(
      byNextNewInput.output.indexOf("exec_command"),
    );
  });

  it("emits and limits toolUsages and toolUsageGroups in analyze JSON", () => {
    const all = captureLog(() =>
      run(["analyze", "--json", fixturePath("tool-usage-session.jsonl")]),
    );
    expect(all.code).toBe(0);
    const fullSession = JSON.parse(all.output) as {
      session: {
        toolUsages: Array<{ nextNewInputRatio?: number | null }>;
        toolUsageGroups: Array<{ nextNewInputRatio?: number | null }>;
      };
    };
    expect(fullSession.session.toolUsages.length).toBeGreaterThan(0);
    expect(fullSession.session.toolUsageGroups.length).toBeGreaterThan(0);
    expect(fullSession.session.toolUsages[0]).toHaveProperty("nextNewInputRatio");
    expect(fullSession.session.toolUsageGroups[0]).toHaveProperty("nextNewInputRatio");

    const limited = captureLog(() =>
      run(["analyze", "--json", "--limit", "1", fixturePath("tool-usage-session.jsonl")]),
    );
    expect(limited.code).toBe(0);
    const limitedSession = JSON.parse(limited.output) as {
      session: { toolUsages: unknown[]; toolUsageGroups: unknown[] };
    };
    expect(limitedSession.session.toolUsages.length).toBeLessThanOrEqual(1);
    expect(limitedSession.session.toolUsageGroups.length).toBeLessThanOrEqual(1);
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

  it("applies analyze json min-chars and limit options to list sections", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctt-cli-json-options-"));
    const path = writeJsonl(dir, "json-options.jsonl", [
      {
        timestamp: "large-1",
        type: "event_msg",
        payload: { type: "user_message", message: "u".repeat(20_000) },
      },
      {
        timestamp: "large-2",
        type: "response_item",
        payload: { type: "message", content: "m".repeat(15_000) },
      },
      {
        timestamp: "tool-1",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "call_1",
          name: "exec_command",
          arguments: JSON.stringify({ cmd: "cmd one" }),
        },
      },
      {
        timestamp: "tool-1-out",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "call_1", output: "x".repeat(100) },
      },
      {
        timestamp: "tool-2",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "call_2",
          name: "exec_command",
          arguments: JSON.stringify({ cmd: "cmd two" }),
        },
      },
      {
        timestamp: "tool-2-out",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "call_2", output: "y".repeat(90) },
      },
      { timestamp: "compact-1", type: "compacted", items: ["a".repeat(100)] },
      { timestamp: "compact-2", type: "event_msg", payload: { type: "context_compacted" } },
      tokenRow(100, "token-1"),
      {
        timestamp: "between",
        type: "event_msg",
        payload: { type: "user_message", message: "between" },
      },
      tokenRow(200, "token-2"),
    ]);

    const defaultThreshold = captureLog(() =>
      run(["analyze", "--json", fixturePath("large-events-session.jsonl")]),
    );
    expect(defaultThreshold.code).toBe(0);
    expect(
      (JSON.parse(defaultThreshold.output) as { session: { largeEvents: unknown[] } }).session
        .largeEvents.length,
    ).toBeGreaterThan(0);

    const highThreshold = captureLog(() =>
      run(["analyze", "--json", "--min-chars", "50000", fixturePath("large-events-session.jsonl")]),
    );
    expect(highThreshold.code).toBe(0);
    expect(
      (JSON.parse(highThreshold.output) as { session: { largeEvents: unknown[] } }).session
        .largeEvents,
    ).toHaveLength(0);

    const limited = captureLog(() => run(["analyze", "--json", "--limit", "1", path]));
    expect(limited.code).toBe(0);
    const session = (
      JSON.parse(limited.output) as {
        session: {
          largeEvents: unknown[];
          heaviestTools: unknown[];
          toolUsages: unknown[];
          toolUsageGroups: unknown[];
          intervals: unknown[];
          compactions: unknown[];
        };
      }
    ).session;
    expect(session.largeEvents).toHaveLength(1);
    expect(session.heaviestTools).toHaveLength(1);
    expect(session.toolUsages).toHaveLength(1);
    expect(session.toolUsageGroups).toHaveLength(1);
    expect(session.intervals).toHaveLength(1);
    expect(session.compactions).toHaveLength(1);
  });

  it("aggregates tools for directory paths unless a session is selected", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctt-cli-tools-dir-"));
    writeJsonl(dir, "alpha-session.jsonl", [
      {
        timestamp: "alpha-call",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "alpha_call",
          name: "exec_command",
          arguments: JSON.stringify({ cmd: "alpha command" }),
        },
      },
      {
        timestamp: "alpha-output",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "alpha_call", output: "a".repeat(120) },
      },
      tokenRow(100, "alpha-token"),
    ]);
    writeJsonl(dir, "beta-session.jsonl", [
      {
        timestamp: "beta-call",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "beta_call",
          name: "exec_command",
          arguments: JSON.stringify({ cmd: "beta command" }),
        },
      },
      {
        timestamp: "beta-output",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "beta_call", output: "b".repeat(80) },
      },
      tokenRow(200, "beta-token"),
    ]);

    const aggregate = captureLog(() => run(["tools", dir]));
    expect(aggregate.code).toBe(0);
    expect(aggregate.output).toContain("alpha command");
    expect(aggregate.output).toContain("beta command");

    const selected = captureLog(() => run(["tools", "--session", "alpha", dir]));
    expect(selected.code).toBe(0);
    expect(selected.output).toContain("alpha command");
    expect(selected.output).not.toContain("beta command");
  });
});
