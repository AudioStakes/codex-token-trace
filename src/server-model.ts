import {
  type EventRecord,
  eventTypeKey,
  execCommandOutputChars,
  finalTotal,
  type JsonObject,
  type JsonValue,
  maxContextRatio,
  maxInputTokens,
  maxNonCachedInputTokens,
  nonCachedInputTokens,
  type SessionAnalysis,
  toolDisplayName,
  toolInputLabel,
  toolOutputChars,
} from "./models.js";
import { compactionImpacts, toolUsageGroups } from "./reports.js";

export type EventKind =
  | "token_count"
  | "user_message"
  | "assistant_message"
  | "reasoning"
  | "tool_call"
  | "tool_output"
  | "apply_patch"
  | "compaction"
  | "session_meta"
  | "turn_context"
  | "task"
  | "other";

export type SessionView = Readonly<{
  session: Readonly<{
    sessionId: string;
    path: string;
    events: number;
    startedAt: string | null;
    endedAt: string | null;
  }>;
  summary: Readonly<{
    finalTotalTokens: number | null;
    finalInputTokens: number | null;
    finalCachedInputTokens: number | null;
    finalOutputTokens: number | null;
    finalReasoningOutputTokens: number | null;
    maxInputTokens: number | null;
    maxNonCachedInputTokens: number | null;
    maxContextUsageRatio: number | null;
    compactionCount: number;
    toolOutputChars: number;
    execCommandOutputChars: number;
  }>;
  pressureSeries: PressurePoint[];
  markers: Marker[];
  timelineLaneEvents: TimelineLaneEvent[];
}>;

export type PressurePoint = Readonly<{
  line: number;
  timestamp: string | null;
  totalProgress: number;
  contextPressure: number | null;
  nonCachedPressure: number;
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  nonCachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  contextWindow: number | null;
}>;

export type TimelineLaneEvent = Readonly<{
  line: number;
  timestamp: string | null;
  lane: "user" | "status" | "tool" | "token" | "compaction";
  kind: EventKind;
  title: string;
  preview: string;
  rawChars: number;
}>;

export type Marker = Readonly<{
  line: number;
  timestamp: string | null;
  kind: "compaction" | "tool_usage_group" | "large_event";
  label: string;
  value?: number;
  rawChars?: number;
  outputChars?: number;
  toolCount?: number;
}>;

export type EventListResponse = Readonly<{
  total: number;
  offset: number;
  limit: number;
  events: EventListItem[];
}>;

export type EventListItem = Readonly<{
  line: number;
  timestamp: string | null;
  kind: EventKind;
  eventType: string;
  title: string;
  preview: string;
  rawChars: number;
}>;

export type EventDetail = EventListItem &
  Readonly<{
    extracted: Record<string, unknown>;
    raw: unknown;
  }>;

const MAX_EVENT_LIMIT = 500;
const DEFAULT_EVENT_LIMIT = 100;
const PREVIEW_CHARS = 240;
const LARGE_EVENT_CHARS = 10_000;

const isObject = (value: JsonValue | undefined): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: JsonValue | undefined): string | null => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
};

const asNumber = (value: JsonValue | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const payloadOf = (event: EventRecord): JsonObject | null =>
  isObject(event.raw.payload) ? event.raw.payload : null;

const shorten = (value: string, maxChars: number): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
};

const stringify = (value: JsonValue | undefined): string => {
  if (value === undefined || value === null) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
};

const tryParseObject = (value: string | null): JsonObject | null => {
  if (value === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as JsonValue;
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const textFromContent = (value: JsonValue | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (isObject(item)) {
          return asString(item.text) ?? asString(item.content) ?? asString(item.output_text) ?? "";
        }
        return "";
      })
      .filter((part) => part.length > 0);
    return parts.length > 0 ? parts.join("\n") : JSON.stringify(value);
  }
  return JSON.stringify(value);
};

const usageObject = (payload: JsonObject): JsonObject | null => {
  const info = payload.info;
  if (!isObject(info)) {
    return null;
  }
  return isObject(info.last_token_usage) ? info.last_token_usage : null;
};

const totalUsageObject = (payload: JsonObject): JsonObject | null => {
  const info = payload.info;
  if (!isObject(info)) {
    return null;
  }
  return isObject(info.total_token_usage) ? info.total_token_usage : null;
};

const numericUsage = (usage: JsonObject | null, key: string): number => Number(usage?.[key] ?? 0);

export const eventKind = (event: EventRecord): EventKind => {
  const payload = payloadOf(event);
  if (event.payloadType === "token_count") {
    return "token_count";
  }
  if (event.topType === "event_msg" && event.payloadType === "user_message") {
    return "user_message";
  }
  if (event.topType === "response_item" && event.payloadType === "message") {
    return "assistant_message";
  }
  if (event.topType === "response_item" && event.payloadType === "reasoning") {
    return "reasoning";
  }
  if (event.topType === "response_item" && event.payloadType === "function_call_output") {
    return "tool_output";
  }
  if (event.topType === "response_item" && event.payloadType === "custom_tool_call_output") {
    return "tool_output";
  }
  if (event.topType === "response_item" && event.payloadType === "function_call") {
    return "tool_call";
  }
  if (event.topType === "response_item" && event.payloadType === "custom_tool_call") {
    const input = stringify(payload?.input ?? payload?.arguments);
    return input.trimStart().startsWith("*** Begin Patch") ? "apply_patch" : "tool_call";
  }
  if (event.topType === "compacted" || event.payloadType === "context_compacted") {
    return "compaction";
  }
  if (event.topType === "session_meta") {
    return "session_meta";
  }
  if (event.topType === "turn_context") {
    return "turn_context";
  }
  if (event.topType === "task_started" || event.topType === "task_complete") {
    return "task";
  }
  return "other";
};

const titleForEvent = (event: EventRecord, kind = eventKind(event)): string => {
  const payload = payloadOf(event);
  if (kind === "tool_call") {
    return asString(payload?.name) ?? asString(payload?.tool_name) ?? "tool call";
  }
  if (kind === "apply_patch") {
    return "apply_patch";
  }
  if (kind === "tool_output") {
    return `tool output ${asString(payload?.call_id) ?? asString(payload?.id) ?? ""}`.trim();
  }
  if (kind === "user_message") {
    return "user message";
  }
  if (kind === "assistant_message") {
    return "assistant message";
  }
  if (kind === "token_count") {
    const total = numericUsage(totalUsageObject(payload ?? {}), "total_tokens");
    return `token_count ${total}`;
  }
  return kind.replaceAll("_", " ");
};

const previewForEvent = (event: EventRecord): string => {
  const payload = payloadOf(event);
  if (payload !== null) {
    for (const key of ["message", "text", "output", "content", "input", "arguments"] as const) {
      const value = payload[key];
      const text = textFromContent(value);
      if (text !== null && text.length > 0) {
        return shorten(text, PREVIEW_CHARS);
      }
    }
  }
  return shorten(JSON.stringify(event.raw), PREVIEW_CHARS);
};

export const eventListItem = (event: EventRecord): EventListItem => {
  const kind = eventKind(event);
  return {
    line: event.lineNo,
    timestamp: event.timestamp,
    kind,
    eventType: eventTypeKey(event),
    title: titleForEvent(event, kind),
    preview: previewForEvent(event),
    rawChars: event.rawChars,
  };
};

const extractToolCall = (payload: JsonObject | null): Record<string, unknown> => {
  const argumentsText = stringify(payload?.arguments ?? payload?.input) || null;
  const parsedArguments = tryParseObject(argumentsText);
  const command =
    asString(parsedArguments?.cmd) ??
    asString(parsedArguments?.command) ??
    asString(parsedArguments?.input) ??
    null;
  return {
    callId: asString(payload?.call_id) ?? asString(payload?.id),
    name: asString(payload?.name) ?? asString(payload?.tool_name) ?? asString(payload?.tool),
    arguments: argumentsText,
    command,
  };
};

const extractToolOutput = (payload: JsonObject | null): Record<string, unknown> => ({
  callId: asString(payload?.call_id) ?? asString(payload?.id),
  output: textFromContent(payload?.output ?? payload?.result ?? payload?.content ?? payload?.text),
});

const extractMessage = (
  payload: JsonObject | null,
  fallbackRole: string,
): Record<string, unknown> => ({
  role: asString(payload?.role) ?? fallbackRole,
  text: textFromContent(payload?.message ?? payload?.content ?? payload?.text),
});

const extractTokenCount = (payload: JsonObject | null): Record<string, unknown> => {
  const last = usageObject(payload ?? {});
  const total = totalUsageObject(payload ?? {});
  const inputTokens = numericUsage(last, "input_tokens");
  const cachedInputTokens = numericUsage(last, "cached_input_tokens");
  const contextWindow = isObject(payload?.info)
    ? asNumber(payload.info.model_context_window)
    : null;
  return {
    inputTokens,
    cachedInputTokens,
    nonCachedInputTokens: Math.max(0, inputTokens - cachedInputTokens),
    outputTokens: numericUsage(last, "output_tokens"),
    reasoningOutputTokens: numericUsage(last, "reasoning_output_tokens"),
    totalTokens: numericUsage(total, "total_tokens"),
    contextWindow,
    contextUsageRatio:
      contextWindow !== null && contextWindow > 0 ? inputTokens / contextWindow : null,
  };
};

const extractedForEvent = (
  event: EventRecord,
  kind = eventKind(event),
): Record<string, unknown> => {
  const payload = payloadOf(event);
  if (kind === "tool_call" || kind === "apply_patch") {
    return extractToolCall(payload);
  }
  if (kind === "tool_output") {
    return extractToolOutput(payload);
  }
  if (kind === "user_message") {
    return extractMessage(payload, "user");
  }
  if (kind === "assistant_message" || kind === "reasoning") {
    return extractMessage(payload, "assistant");
  }
  if (kind === "token_count") {
    return extractTokenCount(payload);
  }
  return {};
};

export const eventDetail = (event: EventRecord): EventDetail => ({
  ...eventListItem(event),
  extracted: extractedForEvent(event),
  raw: event.raw,
});

const firstTimestamp = (analysis: SessionAnalysis): string | null =>
  analysis.events.find((event) => event.timestamp !== null)?.timestamp ?? null;

const lastTimestamp = (analysis: SessionAnalysis): string | null =>
  [...analysis.events].reverse().find((event) => event.timestamp !== null)?.timestamp ?? null;

const percent = (numerator: number, denominator: number): number =>
  denominator > 0 ? (numerator / denominator) * 100 : 0;

const pressureSeries = (analysis: SessionAnalysis): PressurePoint[] => {
  const finalTokens = finalTotal(analysis).totalTokens;
  const maxNonCached = maxNonCachedInputTokens(analysis);
  return analysis.uniqueTokenEvents.map((event) => {
    const inputTokens = event.last.inputTokens;
    const cachedInputTokens = event.last.cachedInputTokens;
    const newInput = nonCachedInputTokens(event.last);
    return {
      line: event.lineNo,
      timestamp: event.timestamp,
      totalProgress: percent(event.total.totalTokens, finalTokens),
      contextPressure:
        event.contextWindow !== null && event.contextWindow > 0
          ? percent(inputTokens, event.contextWindow)
          : null,
      nonCachedPressure: percent(newInput, maxNonCached),
      totalTokens: event.total.totalTokens,
      inputTokens,
      cachedInputTokens,
      nonCachedInputTokens: newInput,
      outputTokens: event.last.outputTokens,
      reasoningOutputTokens: event.last.reasoningOutputTokens,
      contextWindow: event.contextWindow,
    };
  });
};

const topLevelCompactionCount = (analysis: SessionAnalysis): number =>
  analysis.events.filter((event) => event.topType === "compacted").length;

const laneForEvent = (kind: EventKind): TimelineLaneEvent["lane"] | null => {
  if (kind === "user_message") {
    return "user";
  }
  if (kind === "assistant_message" || kind === "reasoning") {
    return "status";
  }
  if (kind === "tool_call" || kind === "tool_output" || kind === "apply_patch") {
    return "tool";
  }
  if (kind === "token_count") {
    return "token";
  }
  if (kind === "compaction") {
    return "compaction";
  }
  return null;
};

const timelineLaneEvents = (analysis: SessionAnalysis): TimelineLaneEvent[] =>
  analysis.events.flatMap((event) => {
    const item = eventListItem(event);
    const lane = laneForEvent(item.kind);
    return lane === null ? [] : [{ ...item, lane }];
  });

const markers = (analysis: SessionAnalysis): Marker[] => {
  const compactions = compactionImpacts(analysis, Number.MAX_SAFE_INTEGER).map((event) => ({
    line: event.line,
    timestamp: event.timestamp,
    kind: "compaction" as const,
    label: "compaction",
    rawChars: event.rawChars,
  }));
  const toolGroups = toolUsageGroups(analysis.toolUsages).map((group) => {
    const marker: Marker = {
      line: group.nextTokenLine,
      timestamp: group.nextTokenTime,
      kind: "tool_usage_group",
      label: `${group.toolCount} tool${group.toolCount === 1 ? "" : "s"}`,
      outputChars: group.outputChars,
      toolCount: group.toolCount,
    };
    return group.nextNonCachedInputTokens === null
      ? marker
      : { ...marker, value: group.nextNonCachedInputTokens };
  });
  const large = analysis.events
    .filter((event) => event.rawChars >= LARGE_EVENT_CHARS)
    .map((event) => ({
      line: event.lineNo,
      timestamp: event.timestamp,
      kind: "large_event" as const,
      label: eventTypeKey(event),
      rawChars: event.rawChars,
      value: event.rawChars,
    }));
  return [...compactions, ...toolGroups, ...large].sort((a, b) => a.line - b.line);
};

export const sessionView = (analysis: SessionAnalysis): SessionView => {
  const final = finalTotal(analysis);
  return {
    session: {
      sessionId: analysis.sessionId,
      path: analysis.path,
      events: analysis.events.length,
      startedAt: firstTimestamp(analysis),
      endedAt: lastTimestamp(analysis),
    },
    summary: {
      finalTotalTokens: analysis.uniqueTokenEvents.length > 0 ? final.totalTokens : null,
      finalInputTokens: analysis.uniqueTokenEvents.length > 0 ? final.inputTokens : null,
      finalCachedInputTokens:
        analysis.uniqueTokenEvents.length > 0 ? final.cachedInputTokens : null,
      finalOutputTokens: analysis.uniqueTokenEvents.length > 0 ? final.outputTokens : null,
      finalReasoningOutputTokens:
        analysis.uniqueTokenEvents.length > 0 ? final.reasoningOutputTokens : null,
      maxInputTokens: analysis.uniqueTokenEvents.length > 0 ? maxInputTokens(analysis) : null,
      maxNonCachedInputTokens:
        analysis.uniqueTokenEvents.length > 0 ? maxNonCachedInputTokens(analysis) : null,
      maxContextUsageRatio: maxContextRatio(analysis),
      compactionCount: topLevelCompactionCount(analysis),
      toolOutputChars: toolOutputChars(analysis),
      execCommandOutputChars: execCommandOutputChars(analysis),
    },
    pressureSeries: pressureSeries(analysis),
    markers: markers(analysis),
    timelineLaneEvents: timelineLaneEvents(analysis),
  };
};

export type SessionOverviewDominantPart =
  | "non_cached_input"
  | "cached_input"
  | "visible_output"
  | "reasoning_output"
  | "adjustment"
  | "unknown";

export type SessionOverviewItem = Readonly<{
  sessionId: string;
  path: string;
  startedAt: string | null;
  endedAt: string | null;

  finalTotalTokens: number | null;
  finalInputTokens: number | null;
  finalCachedInputTokens: number | null;
  finalOutputTokens: number | null;
  finalReasoningOutputTokens: number | null;

  nonCachedInputTokens: number | null;
  visibleOutputTokens: number | null;
  adjustmentTokens: number | null;
  breakdownMismatchTokens: number | null;

  events: number;
  compactions: number;
  maxNonCachedInputTokens: number | null;
  maxContextUsageRatio: number | null;

  dominantPart: SessionOverviewDominantPart;

  likelyDriver: string | null;
  topCommandPreview: string | null;
}>;

export type SessionsOverviewResponse = Readonly<{
  summary: Readonly<{
    sessions: number;
    totalTokens: number;
    medianTotalTokens: number | null;
    maxEvents: number | null;
    sessionsWithCompaction: number;
    startedAt: string | null;
    endedAt: string | null;
  }>;
  sessions: SessionOverviewItem[];
}>;

const sessionOverviewItem = (analysis: SessionAnalysis): SessionOverviewItem => {
  const final = finalTotal(analysis);
  const hasTokens = analysis.uniqueTokenEvents.length > 0;

  const finalTotalTokens = hasTokens ? final.totalTokens : null;
  const finalInputTokens = hasTokens ? final.inputTokens : null;
  const finalCachedInputTokens = hasTokens ? final.cachedInputTokens : null;
  const finalOutputTokens = hasTokens ? final.outputTokens : null;
  const finalReasoningOutputTokens = hasTokens ? final.reasoningOutputTokens : null;

  const nonCachedInputTokens =
    finalInputTokens !== null && finalCachedInputTokens !== null
      ? finalInputTokens - finalCachedInputTokens
      : null;
  const visibleOutputTokens =
    finalOutputTokens !== null && finalReasoningOutputTokens !== null
      ? finalOutputTokens - finalReasoningOutputTokens
      : null;

  const safeNonCachedInputTokens = Math.max(0, nonCachedInputTokens ?? 0);
  const safeCachedInputTokens = Math.max(0, finalCachedInputTokens ?? 0);
  const safeVisibleOutputTokens = Math.max(0, visibleOutputTokens ?? 0);
  const safeReasoningOutputTokens = Math.max(0, finalReasoningOutputTokens ?? 0);

  const knownBreakdownTokens =
    finalTotalTokens === null
      ? null
      : safeNonCachedInputTokens +
        safeCachedInputTokens +
        safeVisibleOutputTokens +
        safeReasoningOutputTokens;

  const breakdownMismatchTokens =
    finalTotalTokens === null || knownBreakdownTokens === null
      ? null
      : finalTotalTokens - knownBreakdownTokens;

  const adjustmentTokens =
    breakdownMismatchTokens !== null && breakdownMismatchTokens > 0 ? breakdownMismatchTokens : 0;

  const candidates: Array<Readonly<[SessionOverviewDominantPart, number]>> = [
    ["non_cached_input", safeNonCachedInputTokens],
    ["cached_input", safeCachedInputTokens],
    ["visible_output", safeVisibleOutputTokens],
    ["reasoning_output", safeReasoningOutputTokens],
    ["adjustment", adjustmentTokens],
  ];
  const [dominantPart, dominantValue] = candidates.reduce(
    (winner, current) => (current[1] > winner[1] ? current : winner),
    ["unknown", 0] as const,
  );

  const topTool = [...analysis.tools].sort((a, b) => b.outputChars - a.outputChars)[0] ?? null;

  return {
    sessionId: analysis.sessionId,
    path: analysis.path,
    startedAt: analysis.events.find((event) => event.timestamp !== null)?.timestamp ?? null,
    endedAt:
      [...analysis.events].reverse().find((event) => event.timestamp !== null)?.timestamp ?? null,
    finalTotalTokens,
    finalInputTokens,
    finalCachedInputTokens,
    finalOutputTokens,
    finalReasoningOutputTokens,
    nonCachedInputTokens,
    visibleOutputTokens,
    adjustmentTokens: finalTotalTokens === null ? null : adjustmentTokens,
    breakdownMismatchTokens,
    events: analysis.events.length,
    compactions: analysis.events.filter((event) => event.topType === "compacted").length,
    maxNonCachedInputTokens: hasTokens ? maxNonCachedInputTokens(analysis) : null,
    maxContextUsageRatio: hasTokens ? maxContextRatio(analysis) : null,
    dominantPart: dominantValue > 0 ? dominantPart : "unknown",
    likelyDriver: topTool === null ? null : toolDisplayName(topTool),
    topCommandPreview: topTool === null ? null : toolInputLabel(topTool),
  };
};

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const left = sorted[middle - 1] ?? sorted[middle] ?? 0;
  const right = sorted[middle] ?? left;
  return sorted.length % 2 === 0 ? (left + right) / 2 : right;
};

export const sessionsOverview = (analyses: SessionAnalysis[]): SessionsOverviewResponse => {
  const sessions = [...analyses].map(sessionOverviewItem).sort((a, b) => {
    const left = a.startedAt === null ? Number.POSITIVE_INFINITY : Date.parse(a.startedAt);
    const right = b.startedAt === null ? Number.POSITIVE_INFINITY : Date.parse(b.startedAt);
    if (left !== right) return left - right;
    return a.path.localeCompare(b.path);
  });

  const totals = sessions
    .map((session) => session.finalTotalTokens)
    .filter((value): value is number => value !== null);
  const startedAtValues = sessions
    .map((session) => session.startedAt)
    .filter((value): value is string => value !== null)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  const endedAtValues = sessions
    .map((session) => session.endedAt)
    .filter((value): value is string => value !== null)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));

  return {
    summary: {
      sessions: sessions.length,
      totalTokens: totals.reduce((sum, value) => sum + value, 0),
      medianTotalTokens: median(totals),
      maxEvents:
        sessions.length === 0 ? null : Math.max(...sessions.map((session) => session.events)),
      sessionsWithCompaction: sessions.filter((session) => session.compactions > 0).length,
      startedAt:
        startedAtValues.length === 0 ? null : new Date(Math.min(...startedAtValues)).toISOString(),
      endedAt:
        endedAtValues.length === 0 ? null : new Date(Math.max(...endedAtValues)).toISOString(),
    },
    sessions,
  };
};

export const eventList = (
  analysis: SessionAnalysis,
  rawOffset: number | null,
  rawLimit: number | null,
): EventListResponse => {
  const offset = Math.max(0, rawOffset ?? 0);
  const requestedLimit = rawLimit ?? DEFAULT_EVENT_LIMIT;
  const limit = Math.max(1, Math.min(MAX_EVENT_LIMIT, requestedLimit));
  return {
    total: analysis.events.length,
    offset,
    limit,
    events: analysis.events.slice(offset, offset + limit).map(eventListItem),
  };
};

export const findEventDetail = (analysis: SessionAnalysis, line: number): EventDetail | null => {
  const event = analysis.events.find((candidate) => candidate.lineNo === line);
  return event === undefined ? null : eventDetail(event);
};
