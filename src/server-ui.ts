export const serverHtml = (): string => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>codex-token-trace session timeline explorer</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #0f172a;
        --panel: rgba(15, 23, 42, 0.92);
        --panel-2: rgba(30, 41, 59, 0.92);
        --text: #e2e8f0;
        --muted: #94a3b8;
        --line: rgba(148, 163, 184, 0.18);
        --blue: #60a5fa;
        --amber: #f59e0b;
        --green: #34d399;
        --purple: #a855f7;
        --red: #f87171;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(96, 165, 250, 0.16), transparent 34%),
          radial-gradient(circle at top right, rgba(168, 85, 247, 0.14), transparent 28%),
          linear-gradient(180deg, #020617 0%, var(--bg) 44%, #020617 100%);
        color: var(--text);
      }

      main {
        max-width: 1200px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }

      header {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        align-items: end;
        justify-content: space-between;
        margin-bottom: 20px;
      }

      h1 {
        margin: 0;
        font-size: clamp(1.6rem, 3vw, 2.7rem);
        letter-spacing: -0.04em;
      }

      .muted {
        color: var(--muted);
      }

      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        margin: 8px 0 16px;
        color: var(--muted);
        font-size: 0.92rem;
      }

      .legend span {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .swatch {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        display: inline-block;
      }

      .grid {
        display: grid;
        grid-template-columns: 1.15fr 0.85fr;
        gap: 16px;
      }

      .card {
        background: linear-gradient(180deg, var(--panel), var(--panel-2));
        border: 1px solid var(--line);
        border-radius: 20px;
        box-shadow: 0 24px 80px rgba(2, 6, 23, 0.42);
        overflow: hidden;
      }

      .card h2 {
        margin: 0;
        padding: 16px 18px 8px;
        font-size: 1rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: var(--muted);
      }

      .canvas-wrap {
        padding: 0 18px 18px;
      }

      canvas {
        width: 100%;
        height: 250px;
        display: block;
      }

      .meta {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        padding: 0 18px 18px;
      }

      .stat {
        background: rgba(15, 23, 42, 0.56);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 12px;
      }

      .stat .label {
        color: var(--muted);
        font-size: 0.76rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }

      .stat .value {
        margin-top: 6px;
        font-size: 1.35rem;
        font-variant-numeric: tabular-nums;
      }

      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 18px 0;
      }

      .toolbar button {
        appearance: none;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.72);
        color: var(--text);
        padding: 8px 12px;
        cursor: pointer;
      }

      .toolbar button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .table-wrap {
        overflow: auto;
        max-height: 620px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.92rem;
      }

      thead th {
        position: sticky;
        top: 0;
        background: rgba(15, 23, 42, 0.98);
        text-align: left;
        color: var(--muted);
        font-size: 0.74rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        padding: 12px 14px;
        border-bottom: 1px solid var(--line);
      }

      tbody td {
        padding: 11px 14px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.12);
        vertical-align: top;
      }

      tbody tr {
        cursor: pointer;
      }

      tbody tr:hover {
        background: rgba(96, 165, 250, 0.07);
      }

      .kind {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8rem;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .pill {
        border-radius: 999px;
        padding: 3px 8px;
        background: rgba(148, 163, 184, 0.16);
        color: var(--text);
        font-size: 0.72rem;
      }

      pre {
        margin: 0;
        padding: 18px;
        overflow: auto;
        max-height: 620px;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 0.88rem;
        line-height: 1.5;
      }

      .detail-empty {
        padding: 18px;
        color: var(--muted);
      }

      @media (max-width: 980px) {
        .grid,
        .meta {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Session timeline explorer</h1>
          <div class="muted" id="page">Loading…</div>
        </div>
      </header>

      <div class="legend">
        <span><span class="swatch" style="background:#60a5fa"></span>total progress</span>
        <span><span class="swatch" style="background:#f59e0b"></span>context pressure</span>
        <span><span class="swatch" style="background:#34d399"></span>non-cached pressure</span>
        <span><span class="swatch" style="background:#a855f7"></span>compaction</span>
        <span><span class="swatch" style="background:#fb923c"></span>tool usage group</span>
        <span><span class="swatch" style="background:#f87171"></span>large event</span>
      </div>

      <section class="card" style="margin-bottom:16px;">
        <h2>Normalized pressure</h2>
        <div class="canvas-wrap">
          <canvas id="pressure" width="1200" height="250"></canvas>
        </div>
      </section>

      <section class="meta">
        <div class="stat"><div class="label">Events</div><div class="value" id="events-count">0</div></div>
        <div class="stat"><div class="label">Compactions</div><div class="value" id="compactions">0</div></div>
        <div class="stat"><div class="label">Tool output chars</div><div class="value" id="tool-output">0</div></div>
        <div class="stat"><div class="label">Exec output chars</div><div class="value" id="exec-output">0</div></div>
      </section>

      <section class="grid" style="margin-top:16px;">
        <div class="card">
          <div class="toolbar">
            <div>
              <button id="prev" type="button">Previous</button>
              <button id="next" type="button">Next</button>
            </div>
            <div class="muted" id="range">Loading…</div>
          </div>
          <h2>Events</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Time</th>
                  <th>Kind</th>
                  <th>Event type</th>
                  <th>Raw chars</th>
                  <th>Preview</th>
                </tr>
              </thead>
              <tbody id="events">
                <tr><td colspan="6" class="detail-empty">Loading…</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <section class="card">
          <h2>Detail</h2>
          <div id="detail" class="detail-empty">Select an event.</div>
        </section>
      </section>
    </main>

    <script>
      const state = { offset: 0, limit: 25, total: 0 };

      const esc = (value) =>
        String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');

      const fmt = (value) => new Intl.NumberFormat('en-US').format(value);

      async function getJson(path) {
        const response = await fetch(path);
        if (!response.ok) throw new Error('Request failed: ' + response.status);
        return response.json();
      }

      function parsedTimestamp(value) {
        if (value === null || value === undefined) return null;
        const time = Date.parse(value);
        return Number.isFinite(time) ? time : null;
      }

      function timestampRange(points, markers) {
        const times = points
          .concat(markers)
          .map((item) => parsedTimestamp(item.timestamp))
          .filter((value) => value !== null);
        if (times.length === 0) return null;
        const min = Math.min(...times);
        const max = Math.max(...times);
        return min === max ? null : { min, max };
      }

      function drawLine(ctx, points, width, height, color, key, pointX) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        let started = false;
        points.forEach((point, index) => {
          const value = point[key];
          if (value === null || value === undefined) return;
          const x = pointX(point, index);
          const y = height - (Math.max(0, Math.min(100, value)) / 100) * height;
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        });
        if (started) ctx.stroke();
      }

      function drawGraph(points, markers) {
        const canvas = document.getElementById('pressure');
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
          const y = (i / 4) * height;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }

        const times = timestampRange(points, markers);
        const minLine = Math.min(1, ...points.map((point) => point.line), ...markers.map((marker) => marker.line));
        const maxLine = Math.max(minLine + 1, ...points.map((point) => point.line), ...markers.map((marker) => marker.line));
        const lineX = (line) => Math.max(0, Math.min(width, ((line - minLine) / (maxLine - minLine)) * width));
        const timeX = (time) => (times === null ? null : Math.max(0, Math.min(width, ((time - times.min) / (times.max - times.min)) * width)));
        const pointX = (point, index) => {
          const time = parsedTimestamp(point.timestamp);
          const x = time === null ? null : timeX(time);
          return x === null ? lineX(point.line) : x;
        };
        const markerX = (marker) => {
          const time = parsedTimestamp(marker.timestamp);
          const x = time === null ? null : timeX(time);
          return x === null ? lineX(marker.line) : x;
        };

        drawLine(ctx, points, width, height, '#60a5fa', 'totalProgress', pointX);
        drawLine(ctx, points, width, height, '#f59e0b', 'contextPressure', pointX);
        drawLine(ctx, points, width, height, '#34d399', 'nonCachedPressure', pointX);

        const maxNonCachedInput = Math.max(0, ...points.map((point) => point.nonCachedInputTokens));
        const pressureY = (value) => height - (Math.max(0, Math.min(100, value)) / 100) * height;

        markers.forEach((marker) => {
          const x = markerX(marker);
          if (marker.kind === 'compaction') {
            ctx.strokeStyle = '#a855f7';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
          } else if (marker.kind === 'tool_usage_group') {
            const markerPressure = marker.value === undefined || maxNonCachedInput <= 0 ? null : (marker.value / maxNonCachedInput) * 100;
            const y = markerPressure === null ? 16 : pressureY(markerPressure);
            ctx.fillStyle = '#fb923c';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
          } else if (marker.kind === 'large_event') {
            ctx.fillStyle = 'rgba(248, 113, 113, 0.65)';
            ctx.beginPath();
            ctx.arc(x, height - 16, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      }

      function clippedPre(id, value) {
        const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        const clipped = text.length > 5000;
        return '<pre id="' + id + '">' + esc(clipped ? text.slice(0, 5000) + '\n…(truncated)' : text) + '</pre>' + (clipped ? '<button data-full="' + id + '">Show full</button>' : '');
      }

      async function loadDetail(line) {
        const detail = await getJson('/api/events/' + line);
        document.getElementById('detail').innerHTML =
          '<div class="detail-empty" style="padding-bottom:0;">Line ' + detail.line + ' · ' + esc(detail.kind) + '</div>' +
          clippedPre('raw-' + line, detail.raw) +
          clippedPre('extracted-' + line, detail.extracted ?? null);
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

      async function loadEvents() {
        const data = await getJson('/api/events?offset=' + state.offset + '&limit=' + state.limit);
        state.total = data.total;
        state.offset = data.offset;
        state.limit = data.limit;
        document.getElementById('page').textContent = (state.offset + 1) + '-' + Math.min(state.offset + state.limit, state.total) + ' of ' + state.total;
        document.getElementById('range').textContent = 'Showing ' + (state.offset + 1) + '-' + Math.min(state.offset + state.limit, state.total) + ' of ' + state.total;
        document.getElementById('events-count').textContent = fmt(data.events.length);
        document.getElementById('compactions').textContent = fmt(data.markers.filter((marker) => marker.kind === 'compaction').length);
        document.getElementById('tool-output').textContent = fmt(data.summary?.toolOutputChars ?? 0);
        document.getElementById('exec-output').textContent = fmt(data.summary?.execCommandOutputChars ?? 0);
        document.getElementById('prev').disabled = state.offset <= 0;
        document.getElementById('next').disabled = state.offset + state.limit >= state.total;
        document.getElementById('events').innerHTML = data.events
          .map((event) =>
            '<tr data-line="' + event.line + '">' +
              '<td>' + event.line + '</td>' +
              '<td>' + esc(event.timestamp ?? '') + '</td>' +
              '<td><span class="kind"><span class="pill">' + esc(event.kind) + '</span></span></td>' +
              '<td>' + esc(event.eventType) + '</td>' +
              '<td>' + fmt(event.rawChars) + '</td>' +
              '<td>' + esc(event.preview) + '</td>' +
            '</tr>',
          )
          .join('');
        document.querySelectorAll('tr[data-line]').forEach((row) => row.addEventListener('click', () => loadDetail(row.dataset.line)));
        drawGraph(data.pressureSeries, data.markers);
      }

      document.getElementById('prev').addEventListener('click', async () => {
        if (state.offset <= 0) return;
        state.offset = Math.max(0, state.offset - state.limit);
        await loadEvents();
      });

      document.getElementById('next').addEventListener('click', async () => {
        if (state.offset + state.limit >= state.total) return;
        state.offset = state.offset + state.limit;
        await loadEvents();
      });

      loadEvents().catch((error) => {
        document.getElementById('events').innerHTML = '<tr><td colspan="6" class="detail-empty">Failed to load events: ' + esc(error.message) + '</td></tr>';
      });
    </script>
  </body>
</html>
`;
