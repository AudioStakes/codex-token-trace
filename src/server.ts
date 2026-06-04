import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { SessionAnalysis } from "./models.js";
import { eventList, findEventDetail, sessionView } from "./server-model.js";
import { serverHtml } from "./server-ui.js";

const numberQuery = (value: string | undefined): number | null => {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const createServerApp = (analysis: SessionAnalysis): Hono => {
  const app = new Hono();

  app.get("/", (context) => context.html(serverHtml()));
  app.get("/api/session", (context) => context.json(sessionView(analysis)));
  app.get("/api/events", (context) =>
    context.json(
      eventList(
        analysis,
        numberQuery(context.req.query("offset")),
        numberQuery(context.req.query("limit")),
      ),
    ),
  );
  app.get("/api/events/:line", (context) => {
    const line = Number(context.req.param("line"));
    if (!Number.isInteger(line)) {
      return context.json({ error: "Event line not found" }, 404);
    }
    const detail = findEventDetail(analysis, line);
    if (detail === null) {
      return context.json({ error: "Event line not found" }, 404);
    }
    return context.json(detail);
  });

  return app;
};

export const startServer = (analysis: SessionAnalysis, port: number): void => {
  const app = createServerApp(analysis);
  serve({ fetch: app.fetch, port });
  console.log(`codex-token-trace server running at http://localhost:${port}`);
};
