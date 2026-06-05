import { singleSessionCss } from "./assets.js";
import { help } from "./shared.js";
import { singleSessionTooltips } from "./tooltips.js";

export const singleSessionHtml = (): string => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>codex-token-trace session timeline explorer</title>
    <style>
${singleSessionCss()}
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Session timeline explorer</h1>
          <div class="muted" id="page">Loading…</div>
          <div class="muted"><a href="/overview">Open multi-session overview</a></div>
        </div>
      </header>

      <div class="legend">
        <span class="legend-item"><span class="swatch" style="background:#60a5fa"></span>total progress ${help(singleSessionTooltips.totalProgress)}</span>
        <span class="legend-item"><span class="swatch" style="background:#f59e0b"></span>context pressure ${help(singleSessionTooltips.contextPressure)}</span>
        <span class="legend-item"><span class="swatch" style="background:#34d399"></span>non-cached pressure ${help(singleSessionTooltips.nonCachedPressure)}</span>
        <span class="legend-item"><span class="swatch" style="background:#22d3ee"></span>user message ${help(singleSessionTooltips.userMessage)}</span>
        <span class="legend-item"><span class="swatch" style="background:#f59e0b"></span>compaction ${help(singleSessionTooltips.compaction)}</span>
        <span class="legend-item"><span class="swatch" style="background:#f87171"></span>large event ${help(singleSessionTooltips.largeEvent)}</span>
        <span class="legend-item"><span class="swatch" style="background:#f472b6"></span>Codex status ${help(singleSessionTooltips.codexStatus)}</span>
        <span class="legend-item"><span class="swatch" style="background:#fb923c"></span>tool ${help(singleSessionTooltips.tool)}</span>
        <span class="legend-item"><span class="swatch" style="background:#e2e8f0"></span>token_count ${help(singleSessionTooltips.tokenCount)}</span>
        <span class="legend-item"><span class="swatch" style="background:#a855f7"></span>compaction</span>
        <span class="legend-item"><span class="swatch" style="background:#f87171"></span>large event</span>
      </div>

      <section class="card" style="margin-bottom:16px;">
        <h2>Normalized pressure</h2>
        <div class="axis-labels"><span>X: time</span><span>Y: normalized pressure / progress (%)</span></div>
        <div class="canvas-wrap">
          <canvas id="pressure" width="1200" height="360"></canvas>
          <div id="tooltip" class="tooltip"></div>
        </div>
      </section>

      <section class="meta">
        <div class="stat"><div class="label">total tokens ${help(singleSessionTooltips.totalTokens)}</div><div class="value" id="total-tokens">0</div></div>
        <div class="stat"><div class="label">max non-cached input ${help(singleSessionTooltips.maxNonCachedInput)}</div><div class="value" id="max-non-cached">0</div></div>
        <div class="stat"><div class="label">max context usage ${help(singleSessionTooltips.maxContextUsage)}</div><div class="value" id="max-context">0%</div></div>
        <div class="stat"><div class="label">compactions ${help(singleSessionTooltips.compactions)}</div><div class="value" id="compactions">0</div></div>
        <div class="stat"><div class="label">events ${help(singleSessionTooltips.events)}</div><div class="value" id="events-count">0</div></div>
      </section>

      <section class="grid" style="margin-top:16px;">
        <div class="card">
          <div class="toolbar">
            <div><button id="prev" type="button">Previous</button> <button id="next" type="button">Next</button></div>
            <div class="muted" id="range">Loading…</div>
          </div>
          <h2>Events</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Line</th><th>Time</th><th>Kind</th><th>Event type</th><th>Raw chars</th><th>Preview</th></tr></thead>
              <tbody id="events"><tr><td colspan="6" class="detail-empty">Loading…</td></tr></tbody>
            </table>
          </div>
        </div>

        <section class="card detail">
          <h2>Detail</h2>
          <div id="detail" class="detail-empty">Select a graph point, event lane point, or event row.</div>
        </section>
      </section>
    </main>

    <script>
      const state = { offset: 0, limit: 25, total: 0, session: null, hits: [] };
      const seriesConfig = [
        { key: 'totalProgress', name: 'total progress', color: '#60a5fa', description: ${JSON.stringify(singleSessionTooltips.totalProgress)} },
        { key: 'contextPressure', name: 'context pressure', color: '#f59e0b', description: ${JSON.stringify(singleSessionTooltips.contextPressure)} },
        { key: 'nonCachedPressure', name: 'non-cached pressure', color: '#34d399', description: ${JSON.stringify(singleSessionTooltips.nonCachedPressure)} },
      ];
      const laneConfig = {
        user: { label: 'user', color: '#22d3ee' },
        status: { label: 'status', color: '#f472b6' },
        tool: { label: 'tool', color: '#fb923c' },
        token: { label: 'token', color: '#e2e8f0' },
        compaction: { label: 'compact', color: '#a855f7' },
      };

      const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
      const fmt = (value) => value === null || value === undefined ? '—' : new Intl.NumberFormat('en-US').format(value);
      const pct = (value) => value === null || value === undefined ? '—' : Number(value).toFixed(1) + '%';
      const timeText = (timestamp) => timestamp ? new Date(timestamp).toLocaleTimeString([], { hour12: false }) : 'line fallback';
      const tooltip = document.getElementById('tooltip');
      const sessionQuery = new URLSearchParams(window.location.search).get('session');
      const apiPath = (path) => {
        if (!sessionQuery) {
          return path;
        }
        return path + (path.includes('?') ? '&' : '?') + 'session=' + encodeURIComponent(sessionQuery);
      };

      async function getJson(path) {
        const response = await fetch(path);
        if (!response.ok) throw new Error('Request failed: ' + response.status);
        return response.json();
      }

      function showTooltip(text, event) {
        tooltip.textContent = text;
        tooltip.style.display = 'block';
        const x = Math.min(window.innerWidth - 380, event.clientX + 14);
        const y = Math.min(window.innerHeight - 220, event.clientY + 14);
        tooltip.style.left = Math.max(8, x) + 'px';
        tooltip.style.top = Math.max(8, y) + 'px';
      }

      function hideTooltip() { tooltip.style.display = 'none'; }

      function parsedTimestamp(value) {
        if (value === null || value === undefined) return null;
        const time = Date.parse(value);
        return Number.isFinite(time) ? time : null;
      }

      function timestampRange(points, markers, lanes) {
        const times = points.concat(markers, lanes).map((item) => parsedTimestamp(item.timestamp)).filter((value) => value !== null);
        if (times.length === 0) return null;
        const min = Math.min(...times);
        const max = Math.max(...times);
        return min === max ? null : { min, max };
      }

      function graphScales(points, markers, lanes, width, plotHeight) {
        const times = timestampRange(points, markers, lanes);
        const allLines = points.map((point) => point.line).concat(markers.map((marker) => marker.line), lanes.map((lane) => lane.line));
        const minLine = Math.min(1, ...allLines);
        const maxLine = Math.max(minLine + 1, ...allLines);
        const lineX = (line) => Math.max(0, Math.min(width, ((line - minLine) / (maxLine - minLine)) * width));
        const timeX = (time) => (times === null ? null : Math.max(0, Math.min(width, ((time - times.min) / (times.max - times.min)) * width)));
        // pointX(point, index) compatibility: xFor uses timestamp first and falls back to event line.
        const xFor = (item) => {
          const time = parsedTimestamp(item.timestamp);
          const x = time === null ? null : timeX(time);
          return x === null ? lineX(item.line) : x;
        };
        const yFor = (value) => plotHeight - (Math.max(0, Math.min(100, value)) / 100) * plotHeight;
        return { times, xFor, yFor };
      }

      function drawAxes(ctx, width, plotHeight, laneTop, times) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px ui-sans-serif, system-ui';
        ctx.textBaseline = 'middle';
        [0, 20, 40, 60, 80, 100].forEach((tick) => {
          const y = plotHeight - (tick / 100) * plotHeight;
          ctx.beginPath(); ctx.moveTo(44, y); ctx.lineTo(width, y); ctx.stroke();
          ctx.fillText(tick + '%', 4, y);
        });
        ctx.beginPath(); ctx.moveTo(44, 0); ctx.lineTo(44, plotHeight); ctx.lineTo(width, plotHeight); ctx.stroke();
        if (times !== null) {
          for (let i = 0; i <= 4; i++) {
            const x = 44 + ((width - 44) * i) / 4;
            const time = times.min + ((times.max - times.min) * i) / 4;
            ctx.fillText(new Date(time).toLocaleTimeString([], { hour12: false }), x - 24, laneTop - 8);
            ctx.beginPath(); ctx.moveTo(x, plotHeight); ctx.lineTo(x, plotHeight + 5); ctx.stroke();
          }
        }
      }

      function drawLine(ctx, points, config, scales, leftPad) {
        ctx.strokeStyle = config.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        let started = false;
        points.forEach((point) => {
          const value = point[config.key];
          if (value === null || value === undefined) return;
          const x = leftPad + scales.xFor(point);
          const y = scales.yFor(value);
          if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
        });
        if (started) ctx.stroke();
        points.forEach((point) => {
          const value = point[config.key];
          if (value === null || value === undefined) return;
          const x = leftPad + scales.xFor(point);
          const y = scales.yFor(value);
          ctx.fillStyle = config.color;
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
          state.hits.push({ type: 'graph-point', x, y, r: 7, point, series: config });
        });
      }

      function graphPointText(hit) {
        const p = hit.point;
        return hit.series.name + '\\n' +
          'time: ' + timeText(p.timestamp) + '\\n' +
          'value: ' + pct(p[hit.series.key]) + '\\n\\n' +
          'raw values:\\n' +
          'inputTokens: ' + fmt(p.inputTokens) + '\\n' +
          'cachedInputTokens: ' + fmt(p.cachedInputTokens) + '\\n' +
          'nonCachedInputTokens: ' + fmt(p.nonCachedInputTokens) + '\\n' +
          'outputTokens: ' + fmt(p.outputTokens) + '\\n' +
          'reasoningOutputTokens: ' + fmt(p.reasoningOutputTokens) + '\\n' +
          'totalTokens: ' + fmt(p.totalTokens) + '\\n' +
          'contextWindow: ' + fmt(p.contextWindow) + '\\n\\n' +
          'description:\\n' + hit.series.description;
      }

      function eventText(event) {
        return event.kind + '\\n' + 'time: ' + timeText(event.timestamp) + '\\n' + 'title: ' + event.title + '\\n' + 'preview: ' + event.preview;
      }

      function drawGraph(points, markers, lanes) {
        const canvas = document.getElementById('pressure');
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const leftPad = 44;
        const laneTop = 268;
        const plotHeight = 238;
        const plotWidth = width - leftPad;
        state.hits = [];
        ctx.clearRect(0, 0, width, height);
        const scales = graphScales(points, markers, lanes, plotWidth, plotHeight);
        drawAxes(ctx, width, plotHeight, laneTop, scales.times);
        seriesConfig.forEach((config) => drawLine(ctx, points, config, scales, leftPad));

        markers.forEach((marker) => {
          const x = leftPad + scales.xFor(marker);
          if (marker.kind === 'large_event') {
            ctx.fillStyle = 'rgba(248, 113, 113, 0.65)';
            ctx.beginPath(); ctx.arc(x, plotHeight - 14, 3, 0, Math.PI * 2); ctx.fill();
          }
        });

        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px ui-sans-serif, system-ui';
        Object.entries(laneConfig).forEach(([lane, config], index) => {
          const y = laneTop + index * 17;
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(config.label, 4, y);
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
          ctx.beginPath(); ctx.moveTo(leftPad, y); ctx.lineTo(width, y); ctx.stroke();
        });
        lanes.forEach((event) => {
          const config = laneConfig[event.lane];
          if (!config) return;
          const laneIndex = Object.keys(laneConfig).indexOf(event.lane);
          const x = leftPad + scales.xFor(event);
          const y = laneTop + laneIndex * 17;
          const radius = event.lane === 'token' ? 4 + Math.min(4, Math.max(0, ((points.find((point) => point.line === event.line)?.nonCachedPressure ?? 0) / 100) * 4)) : 4;
          ctx.fillStyle = config.color;
          ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
          state.hits.push({ type: 'lane-event', x, y, r: radius + 4, event });
        });
      }

      function canvasHit(evt) {
        const canvas = document.getElementById('pressure');
        const rect = canvas.getBoundingClientRect();
        const x = (evt.clientX - rect.left) * (canvas.width / rect.width);
        const y = (evt.clientY - rect.top) * (canvas.height / rect.height);
        return state.hits.find((hit) => Math.hypot(hit.x - x, hit.y - y) <= hit.r) ?? null;
      }

      function clippedPre(id, value) {
        const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        const clipped = text.length > 5000;
        return '<pre id="' + id + '">' + esc(clipped ? text.slice(0, 5000) + '\\n…(truncated)' : text) + '</pre>' + (clipped ? '<button data-full="' + id + '">Show full</button>' : '');
      }

      function setGraphPointDetail(hit) {
        document.getElementById('detail').innerHTML = '<div class="detail-heading">Graph point · line ' + hit.point.line + '</div><div class="detail-summary">' + esc(graphPointText(hit)) + '</div>';
      }

      async function loadDetail(line) {
        const detail = await getJson(apiPath('/api/events/' + line));
        document.querySelectorAll('tr[data-line]').forEach((row) => row.classList.toggle('selected', row.dataset.line === String(line)));
        document.getElementById('detail').innerHTML =
          '<div class="detail-heading">Line ' + detail.line + ' · ' + esc(detail.kind) + '</div>' +
          '<div class="detail-summary">' + esc(eventText(detail)) + '</div>' +
          clippedPre('raw-' + line, detail.raw) + clippedPre('extracted-' + line, detail.extracted ?? null);
        document.querySelectorAll('[data-full]').forEach((button) => {
          button.addEventListener('click', () => {
            const id = button.getAttribute('data-full');
            const pre = document.getElementById(id);
            if (!pre) return;
            pre.textContent = JSON.stringify(detail[id.startsWith('raw') ? 'raw' : 'extracted'], null, 2);
            button.remove();
          });
        });
      }

      async function loadSession() {
        const data = await getJson(apiPath('/api/session'));
        state.session = data;
        document.getElementById('total-tokens').textContent = fmt(data.summary.finalTotalTokens);
        document.getElementById('max-non-cached').textContent = fmt(data.summary.maxNonCachedInputTokens);
        document.getElementById('max-context').textContent = pct((data.summary.maxContextUsageRatio ?? 0) * 100);
        document.getElementById('compactions').textContent = fmt(data.summary.compactionCount);
        document.getElementById('events-count').textContent = fmt(data.session.events);
        drawGraph(data.pressureSeries, data.markers, data.timelineLaneEvents);
      }

      async function loadEvents() {
        const data = await getJson(apiPath('/api/events?offset=' + state.offset + '&limit=' + state.limit));
        state.total = data.total; state.offset = data.offset; state.limit = data.limit;
        document.getElementById('page').textContent = (state.offset + 1) + '-' + Math.min(state.offset + state.limit, state.total) + ' of ' + state.total;
        document.getElementById('range').textContent = 'Showing ' + (state.offset + 1) + '-' + Math.min(state.offset + state.limit, state.total) + ' of ' + state.total;
        document.getElementById('prev').disabled = state.offset <= 0;
        document.getElementById('next').disabled = state.offset + state.limit >= state.total;
        document.getElementById('events').innerHTML = data.events.map((event) =>
          '<tr data-line="' + event.line + '" data-tip="' + esc(eventText(event)) + '">' +
            '<td>' + event.line + '</td><td>' + esc(event.timestamp ?? '') + '</td>' +
            '<td><span class="kind"><span class="pill">' + esc(event.kind) + '</span></span></td>' +
            '<td>' + esc(event.eventType) + '</td><td>' + fmt(event.rawChars) + '</td><td>' + esc(event.preview) + '</td>' +
          '</tr>').join('');
        document.querySelectorAll('tr[data-line]').forEach((row) => {
          row.addEventListener('click', () => loadDetail(row.dataset.line));
          row.addEventListener('mousemove', (event) => showTooltip(row.dataset.tip, event));
          row.addEventListener('mouseleave', hideTooltip);
        });
      }

      document.querySelectorAll('[data-tip].help').forEach((node) => {
        node.addEventListener('mousemove', (event) => showTooltip(node.dataset.tip, event));
        node.addEventListener('mouseleave', hideTooltip);
      });

      document.getElementById('pressure').addEventListener('mousemove', (event) => {
        const hit = canvasHit(event);
        if (hit === null) { hideTooltip(); return; }
        showTooltip(hit.type === 'graph-point' ? graphPointText(hit) : eventText(hit.event), event);
      });
      document.getElementById('pressure').addEventListener('mouseleave', hideTooltip);
      document.getElementById('pressure').addEventListener('click', (event) => {
        const hit = canvasHit(event);
        if (hit === null) return;
        if (hit.type === 'graph-point') setGraphPointDetail(hit);
        else loadDetail(hit.event.line);
      });

      document.getElementById('prev').addEventListener('click', async () => { if (state.offset <= 0) return; state.offset = Math.max(0, state.offset - state.limit); await loadEvents(); });
      document.getElementById('next').addEventListener('click', async () => { if (state.offset + state.limit >= state.total) return; state.offset = state.offset + state.limit; await loadEvents(); });

      Promise.all([loadSession(), loadEvents()]).catch((error) => {
        document.getElementById('events').innerHTML = '<tr><td colspan="6" class="detail-empty">Failed to load events: ' + esc(error.message) + '</td></tr>';
      });
    </script>
  </body>
</html>
`;
