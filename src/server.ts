import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { SessionAnalysis } from "./models.js";
import { eventList, findEventDetail, sessionsOverview, sessionView } from "./server-model.js";
import { overviewHtml, serverHtml } from "./server-ui.js";

const numberQuery = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const selectAnalysis = (
  analyses: SessionAnalysis[],
  sessionQuery: string | null,
): SessionAnalysis | null => {
  if (sessionQuery === null || sessionQuery.trim() === "") return null;

  const exact = analyses.find(
    (analysis) => analysis.sessionId === sessionQuery || analysis.path === sessionQuery,
  );
  if (exact !== undefined) return exact;

  const partial = analyses.find(
    (analysis) => analysis.sessionId.includes(sessionQuery) || analysis.path.includes(sessionQuery),
  );
  return partial ?? null;
};

export const createServerApp = (
  selected: SessionAnalysis,
  analyses: SessionAnalysis[] = [selected],
): Hono => {
  const app = new Hono();

  const resolveSelected = (sessionQuery: string | null): SessionAnalysis =>
    selectAnalysis(analyses, sessionQuery) ?? selected;

  app.get("/", (context) => context.html(serverHtml()));
  app.get("/overview", (context) => context.html(overviewHtml()));

  app.get("/api/session", (context) =>
    context.json(sessionView(resolveSelected(context.req.query("session") ?? null))),
  );

  app.get("/api/sessions/overview", (context) => context.json(sessionsOverview(analyses)));

  app.get("/api/events", (context) =>
    context.json(
      eventList(
        resolveSelected(context.req.query("session") ?? null),
        numberQuery(context.req.query("offset") ?? undefined),
        numberQuery(context.req.query("limit") ?? undefined),
      ),
    ),
  );

  app.get("/api/events/:line", (context) => {
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

  return app;
};

export const startServer = (
  selected: SessionAnalysis,
  analyses: SessionAnalysis[],
  port: number,
): void => {
  const app = createServerApp(selected, analyses);
  serve({ fetch: app.fetch, port });
  console.log(`codex-token-trace server running at http://localhost:${port}`);
};
