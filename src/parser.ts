import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import type { EventRecord, Interval, JsonObject, JsonValue, SessionAnalysis, TokenEvent, ToolCall, Usage } from "./models.js";
import { emptyUsage, eventTypeKey } from "./models.js";

const CALL_TYPES = new Set(["function_call", "custom_tool_call", "web_search_call"]);
const OUTPUT_TYPES = new Set(["function_call_output", "custom_tool_call_output", "web_search_end"]);

type MutableToolCall = {
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
};

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

const payloadType = (row: JsonObject): string | null => {
  const payload = row.payload;
  if (!isObject(payload)) {
    return null;
  }
  return asString(payload.type);
};

const jsonLength = (value: JsonValue | undefined): number => {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === "string") {
    return value.length;
  }
  return JSON.stringify(value).length;
};

const usageFrom = (value: JsonValue | undefined): Usage => {
  if (!isObject(value)) {
    return emptyUsage();
  }
  return {
    inputTokens: Number(value.input_tokens ?? 0),
    cachedInputTokens: Number(value.cached_input_tokens ?? 0),
    outputTokens: Number(value.output_tokens ?? 0),
    reasoningOutputTokens: Number(value.reasoning_output_tokens ?? 0),
    totalTokens: Number(value.total_tokens ?? 0),
  };
};

const parseJsonObject = (text: string): JsonObject | null => {
  try {
    const parsed = JSON.parse(text) as JsonValue;
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const decodeInput = (value: JsonValue | undefined): { label: string; chars: number; preview: string } => {
  if (value === undefined || value === null) {
    return { label: "", chars: 0, preview: "" };
  }

  const chars = jsonLength(value);
  const decoded = typeof value === "string" ? (parseJsonObject(value) ?? value) : value;

  if (typeof decoded === "string") {
    return { label: decoded, chars, preview: decoded };
  }
  if (Array.isArray(decoded)) {
    const label = decoded.map((item) => String(item)).join(" ");
    return { label, chars, preview: label };
  }
  if (isObject(decoded)) {
    const candidate =
      decoded.cmd ?? decoded.command ?? decoded.input ?? decoded.path ?? decoded.filepath ?? decoded.url;
    if (Array.isArray(candidate)) {
      const label = candidate.map((item) => String(item)).join(" ");
      return { label, chars, preview: label };
    }
    if (candidate !== undefined && candidate !== null) {
      const label = typeof candidate === "string" ? candidate : JSON.stringify(candidate);
      return { label, chars, preview: label };
    }
    const label = JSON.stringify(decoded);
    return { label, chars, preview: label };
  }
  const label = String(decoded);
  return { label, chars, preview: label };
};

const callIdOf = (payload: JsonObject): string | null =>
  asString(payload.call_id) ?? asString(payload.id);

const toolNameOf = (payload: JsonObject, fallback: string | null): string | null =>
  asString(payload.name) ?? asString(payload.tool_name) ?? asString(payload.tool) ?? fallback;

const outputCharsOf = (payload: JsonObject): number => {
  for (const key of ["output", "result", "content", "text"] as const) {
    if (key in payload) {
      return jsonLength(payload[key]);
    }
  }
  return jsonLength(payload);
};

const toToolCall = (tool: MutableToolCall): ToolCall => ({ ...tool });

const updateOutput = (tool: MutableToolCall, outputChars: number): void => {
  tool.outputChars += outputChars;
  tool.outputEvents += 1;
};

export const parseSessionFile = (path: string): SessionAnalysis => {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const events: EventRecord[] = [];
  const tokenEvents: TokenEvent[] = [];
  const toolById = new Map<string, MutableToolCall>();
  let sessionMetaCharsTotal = 0;
  let sessionMetaCharsMax = 0;
  let sessionMetaCount = 0;
  let previousTotalTokens: number | null = null;

  for (const [index, rawLine] of lines.entries()) {
    if (rawLine.length === 0) {
      continue;
    }
    const parsed = parseJsonObject(rawLine);
    if (parsed === null) {
      continue;
    }

    const lineNo = index + 1;
    const ptype = payloadType(parsed);
    const topType = asString(parsed.type);
    const event: EventRecord = {
      lineNo,
      timestamp: asString(parsed.timestamp),
      topType,
      payloadType: ptype,
      rawChars: rawLine.length,
      raw: parsed,
    };
    events.push(event);

    if (topType === "session_meta") {
      sessionMetaCount += 1;
      sessionMetaCharsTotal += rawLine.length;
      sessionMetaCharsMax = Math.max(sessionMetaCharsMax, rawLine.length);
    }

    const payload = isObject(parsed.payload) ? parsed.payload : null;
    if (payload === null) {
      continue;
    }

    if (ptype !== null && CALL_TYPES.has(ptype)) {
      const callId = callIdOf(payload);
      if (callId !== null) {
        const input = decodeInput(payload.arguments ?? payload.input);
        toolById.set(callId, {
          callId,
          timestamp: event.timestamp,
          name: toolNameOf(payload, ptype),
          command: input.label,
          argumentsChars: input.chars,
          callType: ptype,
          inputPreview: input.preview,
          inputChars: input.chars,
          outputChars: 0,
          outputEvents: 0,
        });
      }
    } else if (ptype !== null && OUTPUT_TYPES.has(ptype)) {
      const callId = callIdOf(payload);
      if (callId !== null) {
        const existing = toolById.get(callId);
        if (existing !== undefined) {
          updateOutput(existing, outputCharsOf(payload));
        } else {
          toolById.set(callId, {
            callId,
            timestamp: event.timestamp,
            name: toolNameOf(payload, ptype),
            command: "",
            argumentsChars: 0,
            callType: ptype,
            inputPreview: "",
            inputChars: 0,
            outputChars: outputCharsOf(payload),
            outputEvents: 1,
          });
        }
      }
    } else if (ptype === "token_count") {
      const info = payload.info;
      if (isObject(info)) {
        const total = usageFrom(info.total_token_usage);
        const duplicateTotal = previousTotalTokens === total.totalTokens;
        previousTotalTokens = total.totalTokens;
        tokenEvents.push({
          ...event,
          last: usageFrom(info.last_token_usage),
          total,
          contextWindow: typeof info.model_context_window === "number" ? info.model_context_window : null,
          duplicateTotal,
        });
      }
    }
  }

  const tools = [...toolById.values()].map(toToolCall).sort((a, b) => b.outputChars - a.outputChars);
  const uniqueTokenEvents = tokenEvents.filter((event) => !event.duplicateTotal);

  return {
    path,
    sessionId: basename(path, extname(path)),
    events,
    tokenEvents,
    uniqueTokenEvents,
    tools,
    intervals: buildIntervals(events, tokenEvents, toolById),
    sessionMetaCharsTotal,
    sessionMetaCharsMax,
    sessionMetaCount,
  };
};

const buildIntervals = (
  events: EventRecord[],
  tokenEvents: TokenEvent[],
  toolById: ReadonlyMap<string, MutableToolCall>,
): Interval[] => {
  const byLine = new Map(events.map((event) => [event.lineNo, event]));
  const intervals: Interval[] = [];
  let previousLine: number | null = null;

  for (const token of tokenEvents) {
    if (token.duplicateTotal) {
      continue;
    }

    const start = (previousLine ?? 0) + 1;
    const end = token.lineNo - 1;
    const rawCharsByType = new Map<string, number>();
    const countByType = new Map<string, number>();
    const callIds = new Set<string>();

    for (let line = start; line <= end; line += 1) {
      const event = byLine.get(line);
      if (event === undefined) {
        continue;
      }
      const key = eventTypeKey(event);
      rawCharsByType.set(key, (rawCharsByType.get(key) ?? 0) + event.rawChars);
      countByType.set(key, (countByType.get(key) ?? 0) + 1);
      const payload = event.raw.payload;
      if (isObject(payload)) {
        const callId = callIdOf(payload);
        if (callId !== null) {
          callIds.add(callId);
        }
      }
    }

    const intervalTools = [...callIds]
      .map((callId) => toolById.get(callId))
      .filter((tool): tool is MutableToolCall => tool !== undefined)
      .map(toToolCall)
      .sort((a, b) => b.outputChars - a.outputChars);

    intervals.push({
      previousTokenLine: previousLine,
      tokenEvent: token,
      eventCount: Math.max(0, end - start + 1),
      rawCharsByType,
      countByType,
      tools: intervalTools,
    });
    previousLine = token.lineNo;
  }
  return intervals;
};

const walk = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...walk(path));
    } else if (stats.isFile() && path.endsWith(".jsonl")) {
      files.push(path);
    }
  }
  return files;
};

const globToRegExp = (pattern: string): RegExp => {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
};

export const discoverFiles = (paths: string[]): string[] => {
  const files = new Set<string>();
  for (const raw of paths) {
    const expanded = raw.replace(/^~/, process.env.HOME ?? "~");
    if (/[?*[]/.test(expanded)) {
      const absolutePattern = resolve(expanded);
      const base = absolutePattern.slice(0, Math.max(absolutePattern.search(/[?*[]/), 1));
      const slash = base.lastIndexOf("/");
      const root = slash > 0 ? base.slice(0, slash) : process.cwd();
      const regex = globToRegExp(absolutePattern);
      if (statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
        for (const file of walk(root)) {
          if (regex.test(resolve(file))) {
            files.add(resolve(file));
          }
        }
      }
      continue;
    }

    const path = resolve(expanded);
    const stats = statSync(path, { throwIfNoEntry: false });
    if (stats?.isDirectory()) {
      for (const file of walk(path)) {
        files.add(resolve(file));
      }
    } else if (stats?.isFile() && path.endsWith(".jsonl")) {
      files.add(path);
    }
  }
  return [...files].sort();
};
