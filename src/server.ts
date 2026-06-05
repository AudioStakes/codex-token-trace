import { serve } from "@hono/node-server";
import type { Context } from "hono";
import { Hono } from "hono";

import type { SessionAnalysis } from "./models.js";
import { eventList, findEventDetail, sessionsOverview, sessionView } from "./server-model.js";
import {
  overviewClientJs as readOverviewClientJs,
  singleSessionClientJs as readSingleSessionClientJs,
} from "./server-ui/client-assets.js";
import { overviewHtml, serverHtml } from "./server-ui.js";

const numberQuery = (value: string | undefined): number | null => {
  if (value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const optionalQuery = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
};

const selectAnalysis = (
  analyses: SessionAnalysis[],
  selected: SessionAnalysis,
  sessionQuery: string | null,
): SessionAnalysis => {
  if (sessionQuery === null) {
    return selected;
  }

  const exact = analyses.find(
    (analysis) => analysis.sessionId === sessionQuery || analysis.path === sessionQuery,
  );
  if (exact !== undefined) {
    return exact;
  }

  const partial = analyses.find(
    (analysis) => analysis.sessionId.includes(sessionQuery) || analysis.path.includes(sessionQuery),
  );
  return partial ?? selected;
};

export type ServerAssets = {
  overviewClientJs: () => string;
  singleSessionClientJs: () => string;
};

const defaultServerAssets: ServerAssets = {
  overviewClientJs: readOverviewClientJs,
  singleSessionClientJs: readSingleSessionClientJs,
};

type JsonErrorStatus = 400 | 404 | 500;

const jsonError = (context: Context, status: JsonErrorStatus, message: string): Response =>
  context.json({ error: message }, status);

const jsonBody = <T extends object>(context: Context, body: T): Response => context.json(body);

export const createServerApp = (
  selected: SessionAnalysis,
  analyses: SessionAnalysis[],
  assets: ServerAssets = defaultServerAssets,
): Hono => {
  const app = new Hono();
  const api = new Hono();

  const resolveSelected = (sessionQuery: string | null): SessionAnalysis =>
    selectAnalysis(analyses, selected, sessionQuery);

  app.get("/", (context) => context.html(serverHtml()));
  app.get("/overview", (context) => context.html(overviewHtml()));

  app.get("/assets/overview-client.js", (context) => {
    try {
      return context.body(assets.overviewClientJs(), 200, {
        "Content-Type": "text/javascript; charset=utf-8",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "overview-client.js is missing. Run npm run build.";
      return context.text(message, 500);
    }
  });

  app.get("/assets/single-session-client.js", (context) => {
    try {
      return context.body(assets.singleSessionClientJs(), 200, {
        "Content-Type": "text/javascript; charset=utf-8",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "single-session-client.js is missing. Run npm run build.";
      return context.text(message, 500);
    }
  });

  api.get("/session", (context) => {
    const session = optionalQuery(context.req.query("session"));
    return jsonBody(context, sessionView(resolveSelected(session)));
  });

  api.get("/sessions/overview", (context) => {
    return jsonBody(context, sessionsOverview(analyses));
  });

  api.get("/events", (context) => {
    const offset = numberQuery(context.req.query("offset"));
    const limit = numberQuery(context.req.query("limit"));

    return jsonBody(
      context,
      eventList(resolveSelected(optionalQuery(context.req.query("session"))), offset, limit),
    );
  });

  api.get("/events/:line", (context) => {
    const line = numberQuery(context.req.param("line"));
    if (line === null) {
      return jsonError(context, 400, "line parameter must be a number");
    }

    const detail = findEventDetail(
      resolveSelected(optionalQuery(context.req.query("session"))),
      line,
    );
    if (detail === null) {
      return jsonError(context, 404, "Event line not found");
    }

    return jsonBody(context, detail);
  });

  app.route("/api", api);
  return app;
};

export const startServer = (
  selected: SessionAnalysis,
  port: number,
  analyses: SessionAnalysis[],
): void => {
  const app = createServerApp(selected, analyses);
  serve({ fetch: app.fetch, port });
  console.log(`codex-token-trace server running at http://localhost:${port}`);
};
