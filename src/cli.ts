#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { finalTotal, type SessionAnalysis } from "./models.js";
import { discoverFiles, parseSessionFile } from "./parser.js";
import {
  aggregateToolOutputTable,
  analysesToJson,
  compactionTable,
  driversTable,
  intervalTable,
  largeEventsTable,
  sessionSummary,
  sessionsTable,
  type ToolUsageSort,
  timelineTable,
  toolOutputTable,
  toolUsageTable,
} from "./reports.js";

type ParsedArgs = Readonly<{
  command: string;
  paths: string[];
  session: string | null;
  limit: number;
  minChars: number;
  json: boolean;
  execOnly: boolean;
  toolUsageSort: ToolUsageSort;
}>;

const VERSION = "0.3.0";

const help = `codex-token-trace ${VERSION}

Usage:
  codex-token-trace analyze [paths...] [--session text] [--limit n] [--min-chars n] [--json]
  codex-token-trace sessions [paths...] [--limit n] [--json]
  codex-token-trace tools [paths...] [--session text] [--limit n] [--exec-only]
  codex-token-trace tool-usage [paths...] [--session text] [--limit n] [--sort output-chars|next-new-input]
  codex-token-trace commands [paths...] [--session text] [--limit n] [--exec-only]
  codex-token-trace timeline [paths...] [--session text] [--limit n]
  codex-token-trace intervals [paths...] [--session text] [--limit n]
  codex-token-trace compactions [paths...] [--session text] [--limit n]
  codex-token-trace large-events [paths...] [--session text] [--limit n] [--min-chars n]

Defaults:
  paths: ~/.codex/sessions
  command: analyze
`;

const defaultPaths = (): string[] => [join(homedir(), ".codex", "sessions")];

const parseArgs = (argv: string[]): ParsedArgs => {
  const commands = new Set([
    "analyze",
    "sessions",
    "tools",
    "tool-usage",
    "commands",
    "timeline",
    "intervals",
    "compactions",
    "large-events",
  ]);
  let command = "analyze";
  const paths: string[] = [];
  let session: string | null = null;
  let limit = 30;
  let minChars = 10_000;
  let json = false;
  let execOnly = false;
  let toolUsageSort: ToolUsageSort = "output-chars";

  const rest = [...argv];
  const first = rest[0];
  if (first !== undefined && commands.has(first)) {
    command = first;
    rest.shift();
  }

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      command = "help";
    } else if (arg === "--version" || arg === "-v") {
      command = "version";
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--exec-only") {
      execOnly = true;
    } else if (arg === "--session") {
      session = rest[i + 1] ?? null;
      i += 1;
    } else if (arg === "--limit") {
      limit = Number(rest[i + 1] ?? limit);
      i += 1;
    } else if (arg === "--min-chars") {
      minChars = Number(rest[i + 1] ?? minChars);
      i += 1;
    } else if (arg === "--sort") {
      const value = rest[i + 1];
      if (value !== "output-chars" && value !== "next-new-input") {
        throw new Error(`Unknown tool-usage sort: ${value ?? ""}`);
      }
      toolUsageSort = value;
      i += 1;
    } else {
      paths.push(arg);
    }
  }

  return { command, paths, session, limit, minChars, json, execOnly, toolUsageSort };
};

const loadAnalyses = (paths: string[]): SessionAnalysis[] => {
  const files = discoverFiles(paths.length > 0 ? paths : defaultPaths());
  if (files.length === 0) {
    throw new Error("No .jsonl files found. Pass a session file, directory, or glob pattern.");
  }
  const analyses = files
    .map((file) => parseSessionFile(file))
    .filter((analysis) => analysis.events.length > 0);
  if (analyses.length === 0) {
    throw new Error("No readable Codex session events found.");
  }
  return analyses;
};

const pickSession = (analyses: SessionAnalysis[], session: string | null): SessionAnalysis => {
  if (session !== null) {
    const match = analyses.find(
      (analysis) => analysis.sessionId.includes(session) || analysis.path.includes(session),
    );
    if (match === undefined) {
      throw new Error(`No session matched: ${session}`);
    }
    return match;
  }
  const sorted = [...analyses].sort(
    (a, b) => finalTotal(b).totalTokens - finalTotal(a).totalTokens,
  );
  const selected = sorted[0];
  if (selected === undefined) {
    throw new Error("No session found.");
  }
  return selected;
};

const printAnalyze = (analysis: SessionAnalysis, args: ParsedArgs): void => {
  console.log("# Session summary");
  console.log(sessionSummary(analysis));
  console.log();
  console.log("# Likely token drivers by raw JSON size");
  console.log(driversTable(analysis));
  console.log();
  console.log(`# Large events >= ${args.minChars} chars (top ${args.limit})`);
  console.log(largeEventsTable(analysis, args.minChars, args.limit));
  console.log();
  console.log(`# Compaction events and impact (top ${args.limit})`);
  console.log(compactionTable(analysis, args.limit));
  console.log();
  console.log(`# Heaviest tool outputs (top ${args.limit})`);
  console.log(toolOutputTable(analysis.tools, args.limit));
  console.log();
  console.log(`# Heaviest exec command outputs (top ${args.limit})`);
  console.log(toolOutputTable(analysis.tools, args.limit, true));
  console.log();
  console.log(`# Non-cached input spikes (top ${args.limit})`);
  console.log(intervalTable(analysis, args.limit));
};

export const run = (argv: string[]): number => {
  const args = parseArgs(argv);
  if (args.command === "help") {
    console.log(help);
    return 0;
  }
  if (args.command === "version") {
    console.log(VERSION);
    return 0;
  }

  const analyses = loadAnalyses(args.paths);
  if (args.command === "sessions") {
    if (args.json) {
      console.log(
        analysesToJson(analyses, undefined, {
          limit: args.limit,
          largeEventMinChars: args.minChars,
        }),
      );
    } else {
      console.log(sessionsTable(analyses, args.limit));
    }
    return 0;
  }

  const analysis = pickSession(analyses, args.session);
  if (args.command === "analyze") {
    if (args.json) {
      console.log(
        analysesToJson(analyses, analysis, {
          limit: args.limit,
          largeEventMinChars: args.minChars,
        }),
      );
    } else {
      printAnalyze(analysis, args);
    }
  } else if (args.command === "tools" || args.command === "commands") {
    if (args.session === null) {
      console.log(aggregateToolOutputTable(analyses, args.limit, args.execOnly));
    } else {
      console.log(toolOutputTable(analysis.tools, args.limit, args.execOnly));
    }
  } else if (args.command === "tool-usage") {
    console.log("# Tool usage impact");
    console.log(toolUsageTable(analysis.toolUsages, args.limit, args.toolUsageSort));
  } else if (args.command === "timeline") {
    console.log(timelineTable(analysis, args.limit));
  } else if (args.command === "intervals") {
    console.log(intervalTable(analysis, args.limit));
  } else if (args.command === "compactions") {
    console.log(compactionTable(analysis, args.limit));
  } else if (args.command === "large-events") {
    console.log(largeEventsTable(analysis, args.minChars, args.limit));
  } else {
    throw new Error(`Unknown command: ${args.command}`);
  }
  return 0;
};

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
