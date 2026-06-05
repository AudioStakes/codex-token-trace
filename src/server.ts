import { serve } from "@hono/node-server";
import { Hono } from "hono";

import type { SessionAnalysis } from "./models.js";
import { eventList, findEventDetail, sessionsOverview, sessionView } from "./server-model.js";
import { overviewHtml, serverHtml } from "./server-ui.js";
import { overviewClientJs } from "./server-ui/assets.js";

const numberQuery = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const selectAnalysis = (
  analyses: SessionAnalysis[],
  sessionQuery: string | null,
): SessionAnalysis | undefined => {
  if (sessionQuery === null || sessionQuery.trim() === "") return undefined;

  const exact = analyses.find(
    (analysis) => analysis.sessionId === sessionQuery || analysis.path === sessionQuery,
  );
  if (exact !== undefined) return exact;

  const partial = analyses.find(
    (analysis) => analysis.sessionId.includes(sessionQuery) || analysis.path.includes(sessionQuery),
  );
  return partial;
};

export const createServerApp = (
  selected: SessionAnalysis,
  analyses: SessionAnalysis[] = [selected],
): Hono => {
  const app = new Hono();
  const api = new Hono();

  const resolveSelected = (sessionQuery: string | null): SessionAnalysis =>
    selectAnalysis(analyses, sessionQuery) ?? selected;

  app.get("/", (context) => context.html(serverHtml()));
  app.get("/overview", (context) => context.html(overviewHtml()));
  app.get("/assets/overview-client.js", (context) => {
    try {
      return context.body(overviewClientJs(), 200, {
        "Content-Type": "text/javascript; charset=utf-8",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "overview-client.js is missing. Run npm run build.";
      return context.text(message, 500);
    }
  });

  api.get("/session", (context) =>
    context.json(sessionView(resolveSelected(context.req.query("session") ?? null))),
  );

  api.get("/sessions/overview", (context) => context.json(sessionsOverview(analyses)));

  api.get("/events", (context) =>
    context.json(
      eventList(
        resolveSelected(context.req.query("session") ?? null),
        numberQuery(context.req.query("offset") ?? undefined),
        numberQuery(context.req.query("limit") ?? undefined),
      ),
    ),
  );

  api.get("/events/:line", (context) => {
    const line = Number(context.req.param("line"));
    if (!Number.isInteger(line)) {
      return context.json({ error: "Event line not found" }, 404);
    }

    const detail = findEventDetail(resolveSelected(context.req.query("session") ?? null), line);
    if (detail === null) {
      return context.json({ error: "Event line not found" }, 404);
    }

    return context.json(detail);
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
