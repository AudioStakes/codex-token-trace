export const serverHtml = (): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>codex-token-trace session timeline explorer</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; background: #111827; color: #e5e7eb; }
    header, main { padding: 1rem; }
    h1 { margin: 0 0 .25rem; font-size: 1.4rem; }
    .muted { color: #9ca3af; font-size: .85rem; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .75rem; margin: 1rem 0; }
    .card { background: #1f2937; border: 1px solid #374151; border-radius: .6rem; padding: .8rem; }
    .card strong { display: block; font-size: 1.4rem; margin-top: .25rem; }
    .panel { background: #1f2937; border: 1px solid #374151; border-radius: .6rem; padding: 1rem; margin-bottom: 1rem; }
    canvas { width: 100%; height: 260px; background: #030712; border-radius: .4rem; }
    .legend { display: flex; flex-wrap: wrap; gap: .8rem; margin-top: .5rem; font-size: .85rem; }
    .swatch { display: inline-block; width: .8rem; height: .8rem; border-radius: 999px; margin-right: .3rem; vertical-align: -1px; }
    table { width: 100%; border-collapse: collapse; font-size: .85rem; }
    th, td { border-bottom: 1px solid #374151; padding: .45rem; text-align: left; vertical-align: top; }
    tr { cursor: pointer; }
    tr:hover { background: #374151; }
    .grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(320px, .8fr); gap: 1rem; }
    pre { white-space: pre-wrap; overflow: auto; max-height: 45vh; background: #030712; padding: .75rem; border-radius: .4rem; }
    button { background: #2563eb; color: white; border: 0; border-radius: .35rem; padding: .45rem .7rem; margin-right: .5rem; cursor: pointer; }
    button:disabled { background: #4b5563; cursor: not-allowed; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>Session timeline explorer</h1>
    <div id="session-path" class="muted">Loading…</div>
  </header>
  <main>
    <section class="cards" id="summary-cards"></section>
    <section class="panel">
      <h2>Normalized pressure</h2>
      <canvas id="pressure" width="1200" height="300"></canvas>
      <div class="legend">
        <span><span class="swatch" style="background:#60a5fa"></span>total progress</span>
        <span><span class="swatch" style="background:#f59e0b"></span>context pressure</span>
        <span><span class="swatch" style="background:#34d399"></span>non-cached pressure</span>
        <span><span class="swatch" style="background:#a855f7"></span>compaction</span>
        <span><span class="swatch" style="background:#fb923c"></span>tool usage group</span>
        <span><span class="swatch" style="background:#f87171"></span>large event</span>
      </div>
    </section>
    <div class="grid">
      <section class="panel">
        <h2>Events</h2>
        <div style="margin-bottom:.75rem">
          <button id="prev">Previous</button><button id="next">Next</button>
          <span id="page" class="muted"></span>
        </div>
        <table>
          <thead><tr><th>line</th><th>time</th><th>kind</th><th>event type</th><th>raw chars</th><th>preview</th></tr></thead>
          <tbody id="events"></tbody>
        </table>
      </section>
      <section class="panel">
        <h2>Detail</h2>
        <div id="detail" class="muted">Select an event.</div>
      </section>
    </div>
  </main>
  <script>
    const state = { offset: 0, limit: 100, total: 0, detail: null };
    const fmt = (value) => value === null || value === undefined ? "-" : Number(value).toLocaleString();
    const pct = (value) => value === null || value === undefined ? "-" : (value * 100).toFixed(1) + "%";
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[char]));
    async function getJson(url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    }
    function card(label, value) { return '<div class="card"><span class="muted">' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>'; }
    function renderSummary(data) {
      document.getElementById('session-path').textContent = data.session.sessionId + ' — ' + data.session.path;
      document.getElementById('summary-cards').innerHTML = [
        card('total tokens', fmt(data.summary.finalTotalTokens)),
        card('max non-cached input', fmt(data.summary.maxNonCachedInputTokens)),
        card('max context usage', pct(data.summary.maxContextUsageRatio)),
        card('compactions', fmt(data.summary.compactionCount)),
        card('events', fmt(data.session.events)),
      ].join('');
      drawGraph(data.pressureSeries, data.markers);
    }
    function parsedTimestamp(value) {
      if (value === null || value === undefined) return null;
      const time = Date.parse(value);
      return Number.isFinite(time) ? time : null;
    }
    function timestampRange(points, markers) {
      const times = points.concat(markers).map((item) => parsedTimestamp(item.timestamp)).filter((value) => value !== null);
      if (times.length === 0) return null;
      const min = Math.min(...times); const max = Math.max(...times);
      return min === max ? null : { min, max };
    }
    function drawLine(ctx, points, width, height, color, key, pointX) {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); let started = false;
      points.forEach((point, index) => {
        const value = point[key]; if (value === null || value === undefined) return;
        const x = pointX(point, index);
        const y = height - (Math.max(0, Math.min(100, value)) / 100) * height;
        if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
      });
      ctx.stroke();
    }
    function drawGraph(points, markers) {
      const canvas = document.getElementById('pressure'); const ctx = canvas.getContext('2d');
      const width = canvas.width; const height = canvas.height; ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = '#374151'; ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { const y = (i / 4) * height; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
      const times = timestampRange(points, markers);
      const minLine = Math.min(1, ...points.map((point) => point.line), ...markers.map((marker) => marker.line));
      const maxLine = Math.max(minLine + 1, ...points.map((point) => point.line), ...markers.map((marker) => marker.line));
      const lineX = (line) => Math.max(0, Math.min(width, ((line - minLine) / (maxLine - minLine)) * width));
      const timeX = (time) => times === null ? null : Math.max(0, Math.min(width, ((time - times.min) / (times.max - times.min)) * width));
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
          ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        } else if (marker.kind === 'tool_usage_group') {
          const markerPressure = marker.value === undefined || maxNonCachedInput <= 0 ? null : (marker.value / maxNonCachedInput) * 100;
          const y = markerPressure === null ? 16 : pressureY(markerPressure);
          ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        } else if (marker.kind === 'large_event') {
          ctx.fillStyle = 'rgba(248, 113, 113, 0.65)'; ctx.beginPath(); ctx.arc(x, height - 16, 3, 0, Math.PI * 2); ctx.fill();
        }
      });
    }
    async function loadEvents() {
      const data = await getJson('/api/events?offset=' + state.offset + '&limit=' + state.limit);
      state.total = data.total; state.offset = data.offset; state.limit = data.limit;
      document.getElementById('page').textContent = (state.offset + 1) + '-' + Math.min(state.offset + state.limit, state.total) + ' of ' + state.total;
      document.getElementById('prev').disabled = state.offset <= 0;
      document.getElementById('next').disabled = state.offset + state.limit >= state.total;
      document.getElementById('events').innerHTML = data.events.map((event) => '<tr data-line="' + event.line + '"><td>' + event.line + '</td><td>' + esc(event.timestamp ?? '-') + '</td><td>' + esc(event.kind) + '</td><td>' + esc(event.eventType) + '</td><td>' + fmt(event.rawChars) + '</td><td>' + esc(event.preview) + '</td></tr>').join('');
      document.querySelectorAll('tr[data-line]').forEach((row) => row.addEventListener('click', () => loadDetail(row.dataset.line)));
    }
    function clippedPre(id, value) {
      const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      const clipped = text.length > 5000;
      return '<pre id="' + id + '">' + esc(clipped ? text.slice(0, 5000) + '\\n… clipped …' : text) + '</pre>' + (clipped ? '<button data-full="' + id + '">Show full</button>' : '');
    }
    async function loadDetail(line) {
      const detail = await getJson('/api/events/' + line); state.detail = detail;
      document.getElementById('detail').innerHTML = '<div><b>line:</b> ' + detail.line + '</div><div><b>timestamp:</b> ' + esc(detail.timestamp ?? '-') + '</div><div><b>kind:</b> ' + esc(detail.kind) + '</div><div><b>event type:</b> ' + esc(detail.eventType) + '</div><div><b>raw chars:</b> ' + fmt(detail.rawChars) + '</div><div><b>title:</b> ' + esc(detail.title) + '</div><h3>Extracted</h3>' + clippedPre('extracted', detail.extracted) + '<h3>Raw JSON</h3>' + clippedPre('raw', detail.raw);
      document.querySelectorAll('button[data-full]').forEach((button) => button.addEventListener('click', () => {
        const id = button.dataset.full; const value = id === 'raw' ? state.detail.raw : state.detail.extracted;
        document.getElementById(id).textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); button.remove();
      }));
    }
    document.getElementById('prev').addEventListener('click', () => { state.offset = Math.max(0, state.offset - state.limit); loadEvents(); });
    document.getElementById('next').addEventListener('click', () => { state.offset += state.limit; loadEvents(); });
    getJson('/api/session').then(renderSummary).then(loadEvents).catch((error) => { document.body.textContent = error.message; });
  </script>
</body>
</html>`;
