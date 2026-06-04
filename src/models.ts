export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type Usage = Readonly<{
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}>;

export type EventRecord = Readonly<{
  lineNo: number;
  timestamp: string | null;
  topType: string | null;
  payloadType: string | null;
  rawChars: number;
  raw: JsonObject;
}>;

export type TokenEvent = EventRecord &
  Readonly<{
    last: Usage;
    total: Usage;
    contextWindow: number | null;
    duplicateTotal: boolean;
  }>;

export type ToolCall = Readonly<{
  callId: string;
  timestamp: string | null;
  name: string | null;
  command: string;
  argumentsChars: number;
  callType: string;
  inputPreview: string;
  inputChars: number;
  outputChars: number;
  outputEvents: number;
}>;

export type ToolUsage = ToolCall &
  Readonly<{
    startLine: number | null;
    startTime: string | null;
    endLine: number | null;
    endTime: string | null;
    nextTokenLine: number | null;
    nextTokenTime: string | null;
    nextInputTokens: number | null;
    nextCachedInputTokens: number | null;
    nextNonCachedInputTokens: number | null;
    nextNewInputRatio: number | null;
    nextOutputTokens: number | null;
    nextTotalTokens: number | null;
  }>;

export type Interval = Readonly<{
  previousTokenLine: number | null;
  tokenEvent: TokenEvent;
  eventCount: number;
  rawCharsByType: ReadonlyMap<string, number>;
  countByType: ReadonlyMap<string, number>;
  tools: ToolCall[];
}>;

export type SessionAnalysis = Readonly<{
  path: string;
  sessionId: string;
  events: EventRecord[];
  tokenEvents: TokenEvent[];
  uniqueTokenEvents: TokenEvent[];
  tools: ToolCall[];
  toolUsages: ToolUsage[];
  intervals: Interval[];
  sessionMetaCharsTotal: number;
  sessionMetaCharsMax: number;
  sessionMetaCount: number;
}>;

export const emptyUsage = (): Usage => ({
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
});

export const nonCachedInputTokens = (usage: Usage): number =>
  Math.max(0, usage.inputTokens - usage.cachedInputTokens);

export const cacheHitRate = (usage: Usage): number | null => {
  if (usage.inputTokens <= 0) {
    return null;
  }
  return usage.cachedInputTokens / usage.inputTokens;
};

export const contextRatio = (event: TokenEvent): number | null => {
  if (event.contextWindow === null || event.contextWindow <= 0) {
    return null;
  }
  return event.last.inputTokens / event.contextWindow;
};

export const eventTypeKey = (event: Pick<EventRecord, "topType" | "payloadType">): string =>
  `${event.topType ?? "unknown"}/${event.payloadType ?? "no_payload_type"}`;

export const toolDisplayName = (tool: ToolCall): string => tool.name ?? tool.callType ?? "tool";

export const toolInputLabel = (tool: ToolCall): string => tool.command || tool.inputPreview || "-";

export const isExecCommand = (tool: ToolCall): boolean => tool.name === "exec_command";

export const finalTotal = (analysis: SessionAnalysis): Usage =>
  analysis.uniqueTokenEvents.at(-1)?.total ?? emptyUsage();

export const maxInputTokens = (analysis: SessionAnalysis): number =>
  Math.max(0, ...analysis.uniqueTokenEvents.map((event) => event.last.inputTokens));

export const maxNonCachedInputTokens = (analysis: SessionAnalysis): number =>
  Math.max(0, ...analysis.uniqueTokenEvents.map((event) => nonCachedInputTokens(event.last)));

export const maxContextRatio = (analysis: SessionAnalysis): number | null => {
  const ratios = analysis.uniqueTokenEvents
    .map((event) => contextRatio(event))
    .filter((ratio): ratio is number => ratio !== null);
  if (ratios.length === 0) {
    return null;
  }
  return Math.max(...ratios);
};

export const toolOutputChars = (analysis: SessionAnalysis): number =>
  analysis.tools.reduce((sum, tool) => sum + tool.outputChars, 0);

export const execCommandOutputChars = (analysis: SessionAnalysis): number =>
  analysis.tools.filter(isExecCommand).reduce((sum, tool) => sum + tool.outputChars, 0);

export const intervalToolOutputChars = (interval: Interval): number =>
  interval.tools.reduce((sum, tool) => sum + tool.outputChars, 0);

export const intervalExecCommandOutputChars = (interval: Interval): number =>
  interval.tools.filter(isExecCommand).reduce((sum, tool) => sum + tool.outputChars, 0);

export const topIntervalEventTypes = (
  interval: Interval,
  limit: number,
): Array<Readonly<{ eventType: string; rawChars: number; events: number }>> => {
  const rows = [...interval.rawCharsByType.entries()].map(([eventType, rawChars]) => ({
    eventType,
    rawChars,
    events: interval.countByType.get(eventType) ?? 0,
  }));
  return rows.sort((a, b) => b.rawChars - a.rawChars).slice(0, limit);
};
