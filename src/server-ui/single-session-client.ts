/// <reference lib="dom" />

import { singleSessionTooltips } from "./tooltips.js";

type SessionSummary = Readonly<{
  finalTotalTokens: number | null;
  maxNonCachedInputTokens: number | null;
  maxContextUsageRatio: number | null;
  compactionCount: number;
  events: number;
}>;

type PressurePoint = Readonly<{
  line: number;
  timestamp: string | null;
  totalProgress: number;
  contextPressure: number;
  nonCachedPressure: number;
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  nonCachedInputTokens: number;
  visibleOutputTokens: number;
  reasoningOutputTokens: number;
  modelContextWindow: number | null;
}>;

type TimelineMarker = Readonly<{
  line: number;
  timestamp: string | null;
  kind: string;
  label: string;
  value: number | null;
}>;

type TimelineLaneEvent = Readonly<{
  line: number;
  timestamp: string | null;
  lane: "user" | "status" | "tool" | "token" | "compaction";
  kind: string;
  title: string;
  preview: string;
  rawChars: number;
}>;

type SessionData = Readonly<{
  summary: SessionSummary;
  pressureSeries: PressurePoint[];
  markers: TimelineMarker[];
  timelineLaneEvents: TimelineLaneEvent[];
}>;

type EventListItem = Readonly<{
  line: number;
  timestamp: string | null;
  kind: string;
  eventType: string;
  title: string;
  preview: string;
  rawChars: number;
}>;

type EventListResponse = Readonly<{
  total: number;
  offset: number;
  limit: number;
  events: EventListItem[];
}>;

type EventDetailResponse = EventListItem &
  Readonly<{
    extracted: Record<string, unknown>;
    raw: unknown;
  }>;

type SeriesKey = "totalProgress" | "contextPressure" | "nonCachedPressure";

type SeriesConfig = Readonly<{
  key: SeriesKey;
  name: string;
  color: string;
  tooltip: string;
}>;

type LaneHit = Readonly<{
  type: "lane-event";
  event: TimelineLaneEvent;
  x: number;
  y: number;
  width: number;
  height: number;
}>;

type GraphPointHit = Readonly<{
  type: "graph-point";
  point: PressurePoint;
  series: SeriesConfig;
  x: number;
  y: number;
  r: number;
}>;

type Hit = LaneHit | GraphPointHit;

type GraphScales = Readonly<{
  times: { min: number; max: number } | null;
  xFor: (item: PressurePoint | TimelineMarker | TimelineLaneEvent) => number;
  yFor: (value: number) => number;
}>;

type ClientState = {
  session: SessionData | null;
  offset: number;
  limit: number;
  total: number;
  hits: Hit[];
};

const sessionQuery = new URLSearchParams(window.location.search).get("session");

const apiPath = (path: string): string => {
  if (sessionQuery === null) {
    return path;
  }

  return `${path}${path.includes("?") ? "&" : "?"}session=${encodeURIComponent(sessionQuery)}`;
};

const requiredElement = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing element: ${id}`);
  }
  return element as T;
};

const esc = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const numberFormatter = new Intl.NumberFormat("en-US");

const fmt = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : numberFormatter.format(value);

const pct = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : `${Math.round(value)}%`;

const parsedTimestamp = (value: string | null): number | null => {
  if (value === null) {
    return null;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

const state: ClientState = {
  session: null,
  offset: 0,
  limit: 100,
  total: 0,
  hits: [],
};

const seriesConfig: SeriesConfig[] = [
  {
    key: "totalProgress",
    name: "total progress",
    color: "#60a5fa",
    tooltip: singleSessionTooltips.totalProgress,
  },
  {
    key: "contextPressure",
    name: "context pressure",
    color: "#f59e0b",
    tooltip: "Relative pressure compared with the available context window.",
  },
  {
    key: "nonCachedPressure",
    name: "non-cached pressure",
    color: "#34d399",
    tooltip: singleSessionTooltips.nonCachedPressure,
  },
];

const laneConfig: Record<TimelineLaneEvent["lane"], { label: string; color: string }> = {
  user: { label: "user", color: "#22d3ee" },
  status: { label: "status", color: "#f472b6" },
  tool: { label: "tool", color: "#fb923c" },
  token: { label: "token", color: "#e2e8f0" },
  compaction: { label: "compact", color: "#a855f7" },
};

const getJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(apiPath(path));
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
};

const timestampRange = (
  points: PressurePoint[],
  markers: TimelineMarker[],
  lanes: TimelineLaneEvent[],
): { min: number; max: number } | null => {
  const times = [
    ...points.map((point) => parsedTimestamp(point.timestamp)),
    ...markers.map((marker) => parsedTimestamp(marker.timestamp)),
    ...lanes.map((lane) => parsedTimestamp(lane.timestamp)),
  ].filter((value): value is number => value !== null);

  if (times.length === 0) {
    return null;
  }

  const min = Math.min(...times);
  const max = Math.max(...times);
  return min === max ? null : { min, max };
};

const graphScales = (
  points: PressurePoint[],
  markers: TimelineMarker[],
  lanes: TimelineLaneEvent[],
  width: number,
  plotHeight: number,
): GraphScales => {
  const times = timestampRange(points, markers, lanes);
  const allLines = [
    ...points.map((point) => point.line),
    ...markers.map((marker) => marker.line),
    ...lanes.map((lane) => lane.line),
  ];

  const minLine = Math.min(1, ...allLines);
  const maxLine = Math.max(minLine + 1, ...allLines);

  const lineX = (line: number): number =>
    Math.max(0, Math.min(width, ((line - minLine) / (maxLine - minLine)) * width));

  const timeX = (time: number): number => {
    if (times === null) {
      return width / 2;
    }

    return Math.max(0, Math.min(width, ((time - times.min) / (times.max - times.min)) * width));
  };

  const xFor = (item: PressurePoint | TimelineMarker | TimelineLaneEvent): number => {
    const time = parsedTimestamp(item.timestamp);
    const x = time === null ? null : timeX(time);
    return x === null ? lineX(item.line) : x;
  };

  const yFor = (value: number): number =>
    plotHeight - (Math.max(0, Math.min(100, value)) / 100) * plotHeight;

  return { times, xFor, yFor };
};

const drawAxes = (
  ctx: CanvasRenderingContext2D,
  width: number,
  plotHeight: number,
  laneTop: number,
  times: { min: number; max: number } | null,
): void => {
  ctx.strokeStyle = "rgba(148, 163, 184, 0.24)";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px ui-sans-serif, system-ui";
  ctx.textBaseline = "middle";

  [0, 20, 40, 60, 80, 100].forEach((tick) => {
    const y = plotHeight - (tick / 100) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillText(String(tick), 6, y);
  });

  if (times === null) {
    return;
  }

  ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "center";

  [0, 1, 2, 3, 4].forEach((step) => {
    const fraction = step / 4;
    const x = (width * fraction);
    const time = times.min + (times.max - times.min) * fraction;
    ctx.fillText(
      new Date(time).toLocaleTimeString([], { hour12: false }),
      x,
      laneTop - 8,
    );
    ctx.beginPath();
    ctx.moveTo(x, plotHeight);
    ctx.lineTo(x, plotHeight + 5);
    ctx.stroke();
  });
};

const drawLine = (
  ctx: CanvasRenderingContext2D,
  points: PressurePoint[],
  config: SeriesConfig,
  scales: GraphScales,
  leftPad: number,
): void => {
  ctx.strokeStyle = config.color;
  ctx.lineWidth = 2;
  ctx.beginPath();

  let started = false;
  points.forEach((point) => {
    const value = point[config.key];
    if (value === null) {
      return;
    }

    const x = leftPad + scales.xFor(point);
    const y = scales.yFor(value);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }

    ctx.stroke();
    ctx.fillStyle = config.color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
};

const drawGraph = (points: PressurePoint[], markers: TimelineMarker[], lanes: TimelineLaneEvent[]): void => {
  const canvas = requiredElement<HTMLCanvasElement>("pressure");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(220, Math.floor(rect.height));

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("Canvas context unavailable");
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const leftPad = 44;
  const laneTop = 268;
  const plotHeight = 238;
  const plotWidth = Math.max(1, width - leftPad);
  const scales = graphScales(points, markers, lanes, plotWidth, plotHeight);

  state.hits = [];
  drawAxes(ctx, width, plotHeight, laneTop, scales.times);
  seriesConfig.forEach((config) => drawLine(ctx, points, config, scales, leftPad));

  markers.forEach((marker) => {
    const x = leftPad + scales.xFor(marker);
    const y = plotHeight - 14;
    ctx.fillStyle = marker.kind === "large_event" ? "rgba(248, 113, 113, 0.65)" : "#fbbf24";
    ctx.beginPath();
    ctx.arc(x, y, marker.kind === "large_event" ? 3 : 2, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px ui-sans-serif, system-ui";
  Object.entries(laneConfig).forEach(([, config], index) => {
    const y = laneTop + index * 17;
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(config.label, 4, y);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
    ctx.beginPath();
    ctx.moveTo(leftPad, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  });

  lanes.forEach((event) => {
    const config = laneConfig[event.lane];
    const laneIndex = Object.keys(laneConfig).indexOf(event.lane);
    const x = leftPad + scales.xFor(event);
    const y = laneTop + laneIndex * 17 - 5;
    const radius = event.lane === "token" ? 4 : 3;

    ctx.fillStyle = config.color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    state.hits.push({
      type: "lane-event",
      event,
      x: x - radius - 2,
      y: y - radius - 2,
      width: radius * 2 + 4,
      height: radius * 2 + 4,
    });
  });

  points.forEach((point) => {
    seriesConfig.forEach((config) => {
      const value = point[config.key];
      if (value === null) {
        return;
      }

      const x = leftPad + scales.xFor(point);
      const y = scales.yFor(value);
      state.hits.push({
        type: "graph-point",
        x,
        y,
        r: 7,
        point,
        series: config,
      });
    });
  });
};

const canvasHit = (event: MouseEvent): Hit | null => {
  const canvas = requiredElement<HTMLCanvasElement>("pressure");
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (canvas.width / rect.width);
  const y = (event.clientY - rect.top) * (canvas.height / rect.height);
  return (
    state.hits.find((hit) => {
      if (hit.type === "graph-point") {
        return Math.hypot(hit.x - x, hit.y - y) <= hit.r;
      }

      return x >= hit.x && x <= hit.x + hit.width && y >= hit.y && y <= hit.y + hit.height;
    }) ?? null
  );
};

const clippedPre = (id: string, value: unknown): string => {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "null";
  const clipped = text.length > 5000;
  return `<pre id="${id}"${clipped ? ' data-full="true"' : ""}>${esc(
    clipped ? `${text.slice(0, 5000)}…` : text,
  )}</pre>`;
};

const formatTimestamp = (timestamp: string | null): string =>
  timestamp === null ? "unknown" : new Date(timestamp).toLocaleString();

const graphPointText = (hit: GraphPointHit): string => {
  const value = hit.point[hit.series.key];
  return [
    hit.series.name,
    `line ${hit.point.line}`,
    hit.point.timestamp === null ? null : formatTimestamp(hit.point.timestamp),
    value === null ? null : `value ${fmt(value)}`,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
};

const eventText = (event: TimelineLaneEvent | EventListItem): string =>
  [event.kind, event.title, event.preview].filter(Boolean).join(" · ");

const setGraphPointDetail = (hit: GraphPointHit): void => {
  const detail = requiredElement<HTMLDivElement>("detail");
  const value = hit.point[hit.series.key];
  detail.innerHTML =
    `<div class="detail-heading">Graph point · ${esc(hit.series.name)}</div>` +
    `<div class="detail-summary">Line ${hit.point.line} · ${esc(
      hit.point.timestamp ?? "unknown",
    )}</div>` +
    `<div class="detail-summary">Value: ${esc(fmt(value))}</div>` +
    clippedPre("graph-point-detail", {
      line: hit.point.line,
      series: hit.series.key,
      point: hit.point,
    });
};

const showTooltip = (text: string, event: MouseEvent): void => {
  const tooltip = requiredElement<HTMLDivElement>("tooltip");
  tooltip.textContent = text;
  tooltip.hidden = false;
  tooltip.style.left = `${Math.min(window.innerWidth - 20, event.clientX + 14)}px`;
  tooltip.style.top = `${Math.min(window.innerHeight - 20, event.clientY + 14)}px`;
};

const hideTooltip = (): void => {
  requiredElement<HTMLDivElement>("tooltip").hidden = true;
};

const renderEventRows = (events: EventListItem[]): void => {
  const tbody = requiredElement<HTMLTableSectionElement>("events");
  tbody.innerHTML = events
    .map(
      (event) => `
        <tr data-line="${event.line}">
          <td class="mono">${event.line}</td>
          <td>${esc(event.timestamp ?? "unknown")}</td>
          <td>${esc(event.kind)}</td>
          <td>${esc(event.eventType)}</td>
          <td>${esc(event.title)}</td>
          <td>${esc(event.preview)}</td>
          <td class="mono">${fmt(event.rawChars)}</td>
        </tr>
      `,
    )
    .join("");

  tbody.querySelectorAll<HTMLTableRowElement>("tr[data-line]").forEach((row) => {
    const line = Number(row.dataset.line);
    row.addEventListener("mousemove", (event) => {
      const item = events.find((eventItem) => eventItem.line === line);
      if (item !== undefined) {
        showTooltip(eventText(item), event);
      }
    });
    row.addEventListener("mouseleave", hideTooltip);
    row.addEventListener("click", () => {
      void loadDetail(line);
    });
  });
};

const renderHelpTooltips = (): void => {
  document.querySelectorAll<HTMLElement>("[data-tip].help").forEach((node) => {
    node.addEventListener("mousemove", (event) => {
      const tip = node.getAttribute("data-tip");
      if (tip !== null) {
        showTooltip(tip, event);
      }
    });
    node.addEventListener("mouseleave", hideTooltip);
  });
};

const renderPageRange = (total: number, offset: number, limit: number, count: number): void => {
  const start = total === 0 ? 0 : offset + 1;
  const end = total === 0 ? 0 : Math.min(offset + count, total);
  requiredElement<HTMLSpanElement>("page").textContent = `${start}-${end} of ${total}`;
  requiredElement<HTMLSpanElement>("range").textContent = `Showing ${start}-${end} of ${total}`;
  requiredElement<HTMLButtonElement>("prev").disabled = offset <= 0;
  requiredElement<HTMLButtonElement>("next").disabled = offset + limit >= total;
};

const renderDetail = (title: string, summary: string, payload: unknown): void => {
  requiredElement<HTMLDivElement>("detail").innerHTML =
    `<div class="detail-heading">${esc(title)}</div>` +
    `<div class="detail-summary">${esc(summary)}</div>` +
    clippedPre("detail-json", payload);
};

const loadDetail = async (line: number): Promise<void> => {
  const detail = await getJson<EventDetailResponse>(`/api/events/${line}`);
  renderDetail(
    `Line ${detail.line} · ${detail.kind}`,
    eventText(detail),
    {
      metadata: detail.extracted,
      raw: detail.raw,
    },
  );
};

const loadSession = async (): Promise<void> => {
  const data = await getJson<SessionData>("/api/session");
  state.session = data;
  requiredElement<HTMLSpanElement>("total-tokens").textContent = fmt(data.summary.finalTotalTokens);
  requiredElement<HTMLSpanElement>("max-non-cached").textContent = fmt(
    data.summary.maxNonCachedInputTokens,
  );
  requiredElement<HTMLSpanElement>("max-context").textContent = pct(
    data.summary.maxContextUsageRatio === null ? null : data.summary.maxContextUsageRatio * 100,
  );
  requiredElement<HTMLSpanElement>("compactions").textContent = fmt(data.summary.compactionCount);
  requiredElement<HTMLSpanElement>("events-count").textContent = fmt(data.summary.events);
  drawGraph(data.pressureSeries, data.markers, data.timelineLaneEvents);
};

const loadEvents = async (): Promise<void> => {
  const data = await getJson<EventListResponse>(
    `/api/events?offset=${state.offset}&limit=${state.limit}`,
  );
  state.total = data.total;
  state.offset = data.offset;
  state.limit = data.limit;

  renderPageRange(data.total, data.offset, data.limit, data.events.length);
  renderEventRows(data.events);
  renderHelpTooltips();
};

requiredElement<HTMLCanvasElement>("pressure").addEventListener("mousemove", (event) => {
  const hit = canvasHit(event);
  if (hit === null) {
    hideTooltip();
    return;
  }

  showTooltip(hit.type === "graph-point" ? graphPointText(hit) : eventText(hit.event), event);
});

requiredElement<HTMLCanvasElement>("pressure").addEventListener("mouseleave", hideTooltip);
requiredElement<HTMLCanvasElement>("pressure").addEventListener("click", (event) => {
  const hit = canvasHit(event);
  if (hit === null) {
    return;
  }

  if (hit.type === "graph-point") {
    setGraphPointDetail(hit);
  } else {
    void loadDetail(hit.event.line);
  }
});

requiredElement<HTMLButtonElement>("prev").addEventListener("click", async () => {
  if (state.offset <= 0) {
    return;
  }

  state.offset = Math.max(0, state.offset - state.limit);
  await loadEvents();
});

requiredElement<HTMLButtonElement>("next").addEventListener("click", async () => {
  if (state.offset + state.limit >= state.total) {
    return;
  }

  state.offset += state.limit;
  await loadEvents();
});

void Promise.all([loadSession(), loadEvents()]).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  requiredElement<HTMLTableSectionElement>("events").innerHTML =
    `<tr><td colspan="7" class="detail-empty">Failed to load events: ${esc(message)}</td></tr>`;
});
