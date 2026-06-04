import { formatInt, formatPct, shorten, table } from "./formatting.js";
import {
  cacheHitRate,
  contextRatio,
  type EventRecord,
  eventTypeKey,
  execCommandOutputChars,
  finalTotal,
  type Interval,
  intervalExecCommandOutputChars,
  intervalToolOutputChars,
  isExecCommand,
  maxContextRatio,
  maxInputTokens,
  maxNonCachedInputTokens,
  nonCachedInputTokens,
  type SessionAnalysis,
  type TokenEvent,
  type ToolCall,
  type ToolUsage,
  type ToolUsageGroup,
  toolDisplayName,
  toolInputLabel,
  toolOutputChars,
  topIntervalEventTypes,
} from "./models.js";

type EventTypeTotal = Readonly<{
  eventType: string;
  rawChars: number;
  events: number;
  maxChars: number;
}>;

type LargeEvent = Readonly<{
  line: number;
  timestamp: string | null;
  eventType: string;
  rawChars: number;
  preview: string;
}>;

type CompactionImpact = Readonly<{
  line: number;
  timestamp: string | null;
  rawChars: number;
  eventType: string;
  before: TokenEvent | null;
  after: TokenEvent | null;
}>;

export type ToolUsageSort = "output-chars" | "next-new-input";

export type ToolUsageGroupBy = "none" | "next-token";

export type JsonReportOptions = Readonly<{
  largeEventMinChars?: number;
  limit?: number;
}>;

const defaultJsonReportOptions = {
  largeEventMinChars: 10_000,
  limit: 50,
} as const;

const jsonReportOptions = (options: JsonReportOptions = {}): Required<JsonReportOptions> => ({
  largeEventMinChars: options.largeEventMinChars ?? defaultJsonReportOptions.largeEventMinChars,
  limit: options.limit ?? defaultJsonReportOptions.limit,
});

const eventTypeTotals = (analysis: SessionAnalysis): EventTypeTotal[] => {
  const totals = new Map<string, { rawChars: number; events: number; maxChars: number }>();
  for (const event of analysis.events) {
    const key = eventTypeKey(event);
    const current = totals.get(key) ?? { rawChars: 0, events: 0, maxChars: 0 };
    current.rawChars += event.rawChars;
    current.events += 1;
    current.maxChars = Math.max(current.maxChars, event.rawChars);
    totals.set(key, current);
  }
  return [...totals.entries()]
    .map(([eventType, value]) => ({ eventType, ...value }))
    .sort((a, b) => b.rawChars - a.rawChars);
};

const previewEvent = (event: EventRecord, width = 120): string => {
  const payload = event.raw.payload;
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    for (const key of ["message", "text", "output", "content", "input", "arguments"] as const) {
      const value = payload[key];
      if (typeof value === "string") {
        return shorten(value, width);
      }
    }
  }
  return shorten(JSON.stringify(event.raw), width);
};

export const largeEvents = (
  analysis: SessionAnalysis,
  minChars: number,
  limit: number,
): LargeEvent[] =>
  analysis.events
    .filter((event) => event.rawChars >= minChars)
    .map((event) => ({
      line: event.lineNo,
      timestamp: event.timestamp,
      eventType: eventTypeKey(event),
      rawChars: event.rawChars,
      preview: previewEvent(event),
    }))
    .sort((a, b) => b.rawChars - a.rawChars)
    .slice(0, limit);

const findPreviousToken = (analysis: SessionAnalysis, line: number): TokenEvent | null => {
  const previous = analysis.uniqueTokenEvents.filter((event) => event.lineNo < line).at(-1);
  return previous ?? null;
};

const findNextToken = (analysis: SessionAnalysis, line: number): TokenEvent | null => {
  const next = analysis.uniqueTokenEvents.find((event) => event.lineNo > line);
  return next ?? null;
};

export const compactionImpacts = (analysis: SessionAnalysis, limit: number): CompactionImpact[] =>
  analysis.events
    .filter((event) => event.topType === "compacted" || event.payloadType === "context_compacted")
    .map((event) => ({
      line: event.lineNo,
      timestamp: event.timestamp,
      rawChars: event.rawChars,
      eventType: eventTypeKey(event),
      before: findPreviousToken(analysis, event.lineNo),
      after: findNextToken(analysis, event.lineNo),
    }))
    .sort((a, b) => b.rawChars - a.rawChars)
    .slice(0, limit);

const usageBrief = (event: TokenEvent | null): string => {
  if (event === null) {
    return "-";
  }
  return `line ${event.lineNo}: input ${formatInt(event.last.inputTokens)}, cached ${formatInt(
    event.last.cachedInputTokens,
  )}, new ${formatInt(nonCachedInputTokens(event.last))}, total ${formatInt(event.total.totalTokens)}`;
};

export const sessionSummary = (analysis: SessionAnalysis): string => {
  const final = finalTotal(analysis);
  const compacted = compactionImpacts(analysis, Number.MAX_SAFE_INTEGER);
  const compactedChars = compacted.reduce((sum, event) => sum + event.rawChars, 0);
  const rows = [
    ["session", shorten(analysis.sessionId, 72)],
    ["path", analysis.path],
    ["events", formatInt(analysis.events.length)],
    [
      "token events",
      `${formatInt(analysis.uniqueTokenEvents.length)} unique / ${formatInt(analysis.tokenEvents.length)} raw`,
    ],
    ["total tokens", formatInt(final.totalTokens)],
    ["input tokens", formatInt(final.inputTokens)],
    ["cached input tokens", formatInt(final.cachedInputTokens)],
    ["output tokens", formatInt(final.outputTokens)],
    ["reasoning output tokens", formatInt(final.reasoningOutputTokens)],
    ["max input per event", formatInt(maxInputTokens(analysis))],
    ["max non-cached input", formatInt(maxNonCachedInputTokens(analysis))],
    ["max context usage", formatPct(maxContextRatio(analysis))],
    [
      "session_meta chars",
      `${formatInt(analysis.sessionMetaCharsTotal)} total / ${formatInt(
        analysis.sessionMetaCharsMax,
      )} max / ${formatInt(analysis.sessionMetaCount)} events`,
    ],
    ["tool output chars", formatInt(toolOutputChars(analysis))],
    ["exec command output chars", formatInt(execCommandOutputChars(analysis))],
    [
      "compacted chars",
      `${formatInt(compactedChars)} total / ${formatInt(compacted.length)} events`,
    ],
  ];
  return table(["metric", "value"], rows);
};

export const driversTable = (analysis: SessionAnalysis): string =>
  table(
    ["raw_chars", "events", "max_chars", "event_type"],
    eventTypeTotals(analysis).map((row) => [
      formatInt(row.rawChars),
      row.events,
      formatInt(row.maxChars),
      row.eventType,
    ]),
  );

const formatChars = (value: number): string => {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M chars`;
  }
  return `${formatInt(value)} chars`;
};

const plural = (count: number, singular: string, pluralForm = `${singular}s`): string =>
  `${formatInt(count)} ${count === 1 ? singular : pluralForm}`;

const toolOutputGroups = (
  tools: ToolCall[],
): Array<Readonly<{ tool: string; outputChars: number; calls: number }>> => {
  const byTool = new Map<string, { tool: string; outputChars: number; calls: number }>();
  for (const tool of tools) {
    if (tool.outputChars <= 0) {
      continue;
    }
    const name = toolDisplayName(tool);
    const current = byTool.get(name) ?? { tool: name, outputChars: 0, calls: 0 };
    current.outputChars += tool.outputChars;
    current.calls += 1;
    byTool.set(name, current);
  }
  return [...byTool.values()].sort((a, b) => b.outputChars - a.outputChars);
};

const groupSummary = (group: ToolUsageGroup): string => {
  const output = formatChars(group.outputChars);
  if (group.toolCount === 1) {
    const tool = group.topTools[0];
    const name = tool === undefined ? "1 tool" : toolDisplayName(tool);
    return `line ${group.nextTokenLine}: ${formatInt(
      group.nextNonCachedInputTokens,
    )} new input after ${name}, ${output} output`;
  }
  return `line ${group.nextTokenLine}: ${formatInt(
    group.nextNonCachedInputTokens,
  )} new input after ${plural(group.toolCount, "tool")}, ${output} output`;
};

const compactedEvents = (analysis: SessionAnalysis): EventRecord[] =>
  analysis.events.filter((event) => event.topType === "compacted");

const suggestedActions = (analysis: SessionAnalysis): string[] => {
  const topTools = toolOutputGroups(analysis.tools)
    .slice(0, 3)
    .map((group) => group.tool);
  const actions = ["Narrow broad rg/sed commands before reading large outputs."];
  if (topTools.includes("view_image")) {
    actions.push(
      "Use view_image intentionally; it is output-size heavy even when next_new_input is low.",
    );
  }
  actions.push("Avoid repeated reads of generated dist/assets unless necessary.");
  return actions;
};

export const diagnosisReport = (analysis: SessionAnalysis, limit: number): string => {
  const maxItems = Math.max(1, limit);
  const causes: string[] = [];
  const rawDriver = eventTypeTotals(analysis)[0];
  if (rawDriver !== undefined) {
    causes.push(
      `Raw log size is likely dominated by ${rawDriver.eventType}: ${formatChars(
        rawDriver.rawChars,
      )} across ${plural(rawDriver.events, "event")}.`,
    );
  }

  const toolDriver = toolOutputGroups(analysis.tools)[0];
  if (toolDriver !== undefined) {
    causes.push(
      `Tool output size is likely dominated by ${toolDriver.tool}: ${formatChars(
        toolDriver.outputChars,
      )} across ${plural(toolDriver.calls, "call")}.`,
    );
  }

  const groups = toolUsageGroups(analysis.toolUsages)
    .filter((group) => (group.nextNonCachedInputTokens ?? 0) > 0)
    .slice(0, maxItems);
  if (groups.length > 0) {
    causes.push(
      [
        "Non-cached input spikes are associated with recent tool intervals:",
        ...groups.map((group) => `   - ${groupSummary(group)}`),
      ].join("\n"),
    );
  }

  const compacted = compactedEvents(analysis);
  if (compacted.length > 0) {
    const maxCompactedChars = Math.max(...compacted.map((event) => event.rawChars));
    causes.push(
      `Context compaction happened ${plural(compacted.length, "time", "times")}, max compacted event ${formatChars(
        maxCompactedChars,
      )}.`,
    );
  }

  if (causes.length === 0) {
    causes.push("No obvious heuristic drivers were found in this session.");
  }

  return [
    "# Diagnosis",
    "",
    "Likely causes:",
    ...causes.slice(0, maxItems + 2).map((cause, index) => `${index + 1}. ${cause}`),
    "",
    "Suggested next actions:",
    ...suggestedActions(analysis)
      .slice(0, maxItems + 1)
      .map((action) => `- ${action}`),
  ].join("\n");
};

export const largeEventsTable = (
  analysis: SessionAnalysis,
  minChars: number,
  limit: number,
): string =>
  table(
    ["line", "time", "raw_chars", "event_type", "preview"],
    largeEvents(analysis, minChars, limit).map((event) => [
      event.line,
      event.timestamp ?? "-",
      formatInt(event.rawChars),
      event.eventType,
      shorten(event.preview, 100),
    ]),
  );

export const compactionTable = (analysis: SessionAnalysis, limit: number): string =>
  table(
    ["line", "time", "raw_chars", "event_type", "before", "after"],
    compactionImpacts(analysis, limit).map((event) => [
      event.line,
      event.timestamp ?? "-",
      formatInt(event.rawChars),
      event.eventType,
      shorten(usageBrief(event.before), 88),
      shorten(usageBrief(event.after), 88),
    ]),
  );

const toolRows = (
  tools: ToolCall[],
  limit: number,
  onlyExec: boolean,
): Array<Array<string | number>> =>
  tools
    .filter((tool) => tool.outputChars > 0)
    .filter((tool) => !onlyExec || isExecCommand(tool))
    .sort((a, b) => b.outputChars - a.outputChars)
    .slice(0, limit)
    .map((tool) => [
      formatInt(tool.outputChars),
      tool.outputEvents,
      toolDisplayName(tool),
      shorten(toolInputLabel(tool), 100),
    ]);

export const toolOutputTable = (tools: ToolCall[], limit: number, onlyExec = false): string =>
  table(["output_chars", "events", "tool", "input_preview"], toolRows(tools, limit, onlyExec));

const sortedToolUsages = (toolUsages: ToolUsage[], sort: ToolUsageSort): ToolUsage[] =>
  [...toolUsages].sort((a, b) => {
    if (sort === "next-new-input") {
      return (b.nextNonCachedInputTokens ?? -1) - (a.nextNonCachedInputTokens ?? -1);
    }
    return b.outputChars - a.outputChars;
  });

const toolUsageRows = (
  toolUsages: ToolUsage[],
  limit: number,
  sort: ToolUsageSort,
): Array<Array<string | number>> =>
  sortedToolUsages(toolUsages, sort)
    .slice(0, limit)
    .map((usage) => [
      formatInt(usage.outputChars),
      toolDisplayName(usage),
      usage.startLine ?? usage.endLine ?? "-",
      usage.startTime ?? usage.endTime ?? "-",
      formatInt(usage.nextNonCachedInputTokens),
      formatPct(usage.nextNewInputRatio),
      formatInt(usage.nextInputTokens),
      formatInt(usage.nextCachedInputTokens),
      formatInt(usage.nextTotalTokens),
      shorten(toolInputLabel(usage), 100),
    ]);

export const toolUsageTable = (
  toolUsages: ToolUsage[],
  limit: number,
  sort: ToolUsageSort = "output-chars",
): string =>
  table(
    [
      "output_chars",
      "tool",
      "line",
      "time",
      "next_new_input",
      "next_new_ratio",
      "next_input",
      "next_cached",
      "next_total",
      "input_preview",
    ],
    toolUsageRows(toolUsages, limit, sort),
  );

export const toolUsageGroups = (toolUsages: ToolUsage[]): ToolUsageGroup[] => {
  const byNextTokenLine = new Map<number, ToolUsage[]>();
  for (const usage of toolUsages) {
    if (usage.nextTokenLine === null) {
      continue;
    }
    const group = byNextTokenLine.get(usage.nextTokenLine) ?? [];
    group.push(usage);
    byNextTokenLine.set(usage.nextTokenLine, group);
  }

  return [...byNextTokenLine.entries()]
    .map(([nextTokenLine, usages]) => {
      const first = usages[0];
      return {
        nextTokenLine,
        nextTokenTime: first?.nextTokenTime ?? null,
        nextInputTokens: first?.nextInputTokens ?? null,
        nextCachedInputTokens: first?.nextCachedInputTokens ?? null,
        nextNonCachedInputTokens: first?.nextNonCachedInputTokens ?? null,
        nextNewInputRatio: first?.nextNewInputRatio ?? null,
        nextOutputTokens: first?.nextOutputTokens ?? null,
        nextTotalTokens: first?.nextTotalTokens ?? null,
        toolCount: usages.length,
        outputChars: usages.reduce((sum, usage) => sum + usage.outputChars, 0),
        topTools: [...usages].sort((a, b) => b.outputChars - a.outputChars),
      };
    })
    .sort((a, b) => {
      const byNextNewInput =
        (b.nextNonCachedInputTokens ?? -1) - (a.nextNonCachedInputTokens ?? -1);
      if (byNextNewInput !== 0) {
        return byNextNewInput;
      }
      return b.outputChars - a.outputChars;
    });
};

const topToolsText = (tools: ToolUsage[], limit: number, width: number): string =>
  shorten(
    tools
      .slice(0, limit)
      .map((tool) => `${toolDisplayName(tool)}: ${toolInputLabel(tool)}`)
      .join(", "),
    width,
  );

const toolUsageGroupRows = (
  groups: ToolUsageGroup[],
  limit: number,
): Array<Array<string | number>> =>
  groups
    .slice(0, limit)
    .map((group) => [
      formatInt(group.nextNonCachedInputTokens),
      formatPct(group.nextNewInputRatio),
      group.nextTokenLine,
      group.nextTokenTime ?? "-",
      group.toolCount,
      formatInt(group.outputChars),
      topToolsText(group.topTools, 3, 100),
    ]);

export const toolUsageGroupTable = (toolUsages: ToolUsage[], limit: number): string =>
  table(
    [
      "next_new_input",
      "next_new_ratio",
      "token_line",
      "time",
      "tools",
      "output_chars",
      "top_tools",
    ],
    toolUsageGroupRows(toolUsageGroups(toolUsages), limit),
  );

export const aggregateToolOutputTable = (
  analyses: SessionAnalysis[],
  limit: number,
  onlyExec = false,
): string => {
  const byKey = new Map<
    string,
    { outputChars: number; calls: number; tool: string; input: string }
  >();
  for (const analysis of analyses) {
    for (const tool of analysis.tools) {
      if (tool.outputChars <= 0 || (onlyExec && !isExecCommand(tool))) {
        continue;
      }
      const key = `${toolDisplayName(tool)}\0${toolInputLabel(tool)}`;
      const current = byKey.get(key) ?? {
        outputChars: 0,
        calls: 0,
        tool: toolDisplayName(tool),
        input: toolInputLabel(tool),
      };
      current.outputChars += tool.outputChars;
      current.calls += 1;
      byKey.set(key, current);
    }
  }
  return table(
    ["output_chars", "calls", "tool", "input_preview"],
    [...byKey.values()]
      .sort((a, b) => b.outputChars - a.outputChars)
      .slice(0, limit)
      .map((row) => [formatInt(row.outputChars), row.calls, row.tool, shorten(row.input, 100)]),
  );
};

export const timelineTable = (analysis: SessionAnalysis, limit: number | null): string => {
  const events =
    limit === null ? analysis.uniqueTokenEvents : analysis.uniqueTokenEvents.slice(0, limit);
  return table(
    [
      "line",
      "time",
      "input",
      "cached",
      "new_input",
      "output",
      "reasoning",
      "total",
      "ctx",
      "cache",
    ],
    events.map((event) => [
      event.lineNo,
      event.timestamp ?? "-",
      formatInt(event.last.inputTokens),
      formatInt(event.last.cachedInputTokens),
      formatInt(nonCachedInputTokens(event.last)),
      formatInt(event.last.outputTokens),
      formatInt(event.last.reasoningOutputTokens),
      formatInt(event.last.totalTokens),
      formatPct(contextRatio(event)),
      formatPct(cacheHitRate(event.last)),
    ]),
  );
};

const topEventTypesText = (interval: Interval, limit: number, width: number): string => {
  const parts = topIntervalEventTypes(interval, limit).map(
    (event) => `${event.eventType}:${formatInt(event.rawChars)}(${event.events})`,
  );
  return shorten(parts.join(", "), width);
};

export const intervalTable = (analysis: SessionAnalysis, limit: number): string => {
  const intervals = [...analysis.intervals]
    .sort(
      (a, b) => nonCachedInputTokens(b.tokenEvent.last) - nonCachedInputTokens(a.tokenEvent.last),
    )
    .slice(0, limit);
  return table(
    [
      "line",
      "time",
      "new_input",
      "input",
      "cached",
      "prev_tool_out",
      "prev_exec_out",
      "prev_events",
      "top_prev_event_types",
      "top_prev_tool",
      "top_prev_input_preview",
    ],
    intervals.map((interval) => {
      const topTool = interval.tools[0] ?? null;
      return [
        interval.tokenEvent.lineNo,
        interval.tokenEvent.timestamp ?? "-",
        formatInt(nonCachedInputTokens(interval.tokenEvent.last)),
        formatInt(interval.tokenEvent.last.inputTokens),
        formatInt(interval.tokenEvent.last.cachedInputTokens),
        formatInt(intervalToolOutputChars(interval)),
        formatInt(intervalExecCommandOutputChars(interval)),
        formatInt(interval.eventCount),
        topEventTypesText(interval, 3, 88),
        topTool === null ? "" : toolDisplayName(topTool),
        topTool === null ? "" : shorten(toolInputLabel(topTool), 72),
      ];
    }),
  );
};

export const sessionsTable = (analyses: SessionAnalysis[], limit: number): string =>
  table(
    ["session", "total", "input", "cached", "output", "max_new_input", "max_ctx", "tool_out_chars"],
    [...analyses]
      .sort((a, b) => finalTotal(b).totalTokens - finalTotal(a).totalTokens)
      .slice(0, limit)
      .map((analysis) => [
        shorten(analysis.sessionId, 48),
        formatInt(finalTotal(analysis).totalTokens),
        formatInt(finalTotal(analysis).inputTokens),
        formatInt(finalTotal(analysis).cachedInputTokens),
        formatInt(finalTotal(analysis).outputTokens),
        formatInt(maxNonCachedInputTokens(analysis)),
        formatPct(maxContextRatio(analysis)),
        formatInt(toolOutputChars(analysis)),
      ]),
  );

const toolUsageToJson = (usage: ToolUsage): Record<string, unknown> => ({
  callId: usage.callId,
  tool: toolDisplayName(usage),
  inputPreview: toolInputLabel(usage),
  inputChars: usage.inputChars,
  outputChars: usage.outputChars,
  outputEvents: usage.outputEvents,
  startLine: usage.startLine,
  startTime: usage.startTime,
  endLine: usage.endLine,
  endTime: usage.endTime,
  nextTokenLine: usage.nextTokenLine,
  nextTokenTime: usage.nextTokenTime,
  nextInputTokens: usage.nextInputTokens,
  nextCachedInputTokens: usage.nextCachedInputTokens,
  nextNonCachedInputTokens: usage.nextNonCachedInputTokens,
  nextNewInputRatio: usage.nextNewInputRatio,
  nextOutputTokens: usage.nextOutputTokens,
  nextTotalTokens: usage.nextTotalTokens,
});

const toolUsageGroupToJson = (group: ToolUsageGroup): Record<string, unknown> => ({
  nextTokenLine: group.nextTokenLine,
  nextTokenTime: group.nextTokenTime,
  nextInputTokens: group.nextInputTokens,
  nextCachedInputTokens: group.nextCachedInputTokens,
  nextNonCachedInputTokens: group.nextNonCachedInputTokens,
  nextNewInputRatio: group.nextNewInputRatio,
  nextOutputTokens: group.nextOutputTokens,
  nextTotalTokens: group.nextTotalTokens,
  toolCount: group.toolCount,
  outputChars: group.outputChars,
  topTools: group.topTools.map(toolUsageToJson),
});

export const sessionToJson = (
  analysis: SessionAnalysis,
  options: JsonReportOptions = {},
): Record<string, unknown> => {
  const resolved = jsonReportOptions(options);
  return {
    sessionId: analysis.sessionId,
    path: analysis.path,
    events: analysis.events.length,
    tokenEvents: analysis.uniqueTokenEvents.length,
    rawTokenEvents: analysis.tokenEvents.length,
    finalTotal: finalTotal(analysis),
    maxInputTokens: maxInputTokens(analysis),
    maxNonCachedInputTokens: maxNonCachedInputTokens(analysis),
    maxContextRatio: maxContextRatio(analysis),
    sessionMeta: {
      charsTotal: analysis.sessionMetaCharsTotal,
      charsMax: analysis.sessionMetaCharsMax,
      count: analysis.sessionMetaCount,
    },
    toolOutputChars: toolOutputChars(analysis),
    execCommandOutputChars: execCommandOutputChars(analysis),
    drivers: eventTypeTotals(analysis),
    largeEvents: largeEvents(analysis, resolved.largeEventMinChars, resolved.limit),
    compactions: compactionImpacts(analysis, resolved.limit).map((event) => ({
      line: event.line,
      timestamp: event.timestamp,
      rawChars: event.rawChars,
      eventType: event.eventType,
      beforeLine: event.before?.lineNo ?? null,
      afterLine: event.after?.lineNo ?? null,
    })),
    toolUsages: analysis.toolUsages.slice(0, resolved.limit).map(toolUsageToJson),
    toolUsageGroups: toolUsageGroups(analysis.toolUsages)
      .slice(0, resolved.limit)
      .map(toolUsageGroupToJson),
    heaviestTools: analysis.tools
      .filter((tool) => tool.outputChars > 0)
      .sort((a, b) => b.outputChars - a.outputChars)
      .slice(0, resolved.limit)
      .map((tool) => ({
        tool: toolDisplayName(tool),
        inputPreview: toolInputLabel(tool),
        outputChars: tool.outputChars,
        outputEvents: tool.outputEvents,
        timestamp: tool.timestamp,
      })),
    intervals: [...analysis.intervals]
      .sort(
        (a, b) => nonCachedInputTokens(b.tokenEvent.last) - nonCachedInputTokens(a.tokenEvent.last),
      )
      .slice(0, resolved.limit)
      .map((interval) => ({
        line: interval.tokenEvent.lineNo,
        timestamp: interval.tokenEvent.timestamp,
        newInput: nonCachedInputTokens(interval.tokenEvent.last),
        input: interval.tokenEvent.last.inputTokens,
        cached: interval.tokenEvent.last.cachedInputTokens,
        toolOutputChars: intervalToolOutputChars(interval),
        execCommandOutputChars: intervalExecCommandOutputChars(interval),
        eventCount: interval.eventCount,
        topEventTypes: topIntervalEventTypes(interval, 5),
        topTool: interval.tools[0] ? toolDisplayName(interval.tools[0]) : null,
        topToolInputPreview: interval.tools[0] ? toolInputLabel(interval.tools[0]) : null,
      })),
  };
};

export const analysesToJson = (
  analyses: SessionAnalysis[],
  session?: SessionAnalysis,
  options: JsonReportOptions = {},
): string => {
  const payload = session
    ? { session: sessionToJson(session, options) }
    : { sessions: analyses.map((analysis) => sessionToJson(analysis, options)) };
  return JSON.stringify(payload, null, 2);
};
