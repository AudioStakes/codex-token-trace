import { serve } from "@hono/node-server";
import { type Context, Hono } from "hono";

import type { SessionAnalysis } from "./models.js";
import { eventList, findEventDetail, sessionsOverview, sessionView } from "./server-model.js";
import { overviewClientJs as readOverviewClientJs } from "./server-ui/overview-client-asset.js";
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
};

const defaultServerAssets: ServerAssets = {
  overviewClientJs: readOverviewClientJs,
};

const jsonError = (context: Context, status: 400 | 404, message: string): Response =>
  context.body(JSON.stringify({ error: message }), status, {
    "Content-Type": "application/json; charset=utf-8",
  });

const jsonBody = (context: Context, value: unknown): Response =>
  context.body(JSON.stringify(value), 200, {
    "Content-Type": "application/json; charset=utf-8",
  });

export const createServerApp = (
  selected: SessionAnalysis,
  analyses: SessionAnalysis[] = [selected],
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
      return context.body(message, 500, {
        "Content-Type": "text/plain; charset=utf-8",
      });
    }
  });

  api.get("/session", (context) => {
    const query = optionalQuery(context.req.query("session"));
    const session = resolveSelected(query);
    return jsonBody(context, sessionView(session));
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
  analyses: SessionAnalysis[] = [selected],
): void => {
  const app = createServerApp(selected, analyses);
  serve({ fetch: app.fetch, port });
  console.log(`codex-token-trace server running at http://localhost:${port}`);
};
