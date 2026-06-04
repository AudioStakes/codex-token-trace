const summaryTooltips = {
  totalTokens:
    "セッション全体で使った token の合計。会話、ファイル内容、コマンド結果、Codex の出力などを含む累積の使用量。",
  maxNonCachedInput:
    "セッション中で、新しく処理された入力が最も大きかった値。会話、ファイル内容、コマンド結果などが新しく読み込まれると増える。キャッシュで再利用された分は除く（nonCachedInputTokens）。",
  maxContextUsage:
    "Codex が一度に見ている情報量（inputTokens）が、上限（modelContextWindow）にどれくらい近づいたか。会話履歴、ファイル内容、コマンド結果などが溜まると上がる。高いほど context が重く、圧縮が起きやすい。",
  compactions:
    "Codex が長くなった文脈を圧縮した回数。会話履歴や作業内容が増えて、扱える情報量の上限に近づくと起きる。summary では実際の圧縮イベントだけを数える。",
  events:
    "セッションログに記録された出来事の件数。ユーザー入力、Codex の返答、ツール実行、token 計測などを含む。",
} as const;

const legendTooltips = {
  totalProgress:
    "セッション全体の token 使用量が、最終的な合計に対してどこまで進んだか。100% に近いほど、セッション終盤に近い（totalTokens / finalTotalTokens）。",
  contextPressure:
    "Codex が一度に見ている情報量（inputTokens）が、上限（modelContextWindow）にどれくらい近づいたか。高いほど context が重い。",
  nonCachedPressure:
    "新しく処理された入力の大きさが、そのセッション内の最大値に対してどれくらい大きいか。急に上がる箇所は、新しい会話、ファイル内容、コマンド結果などが多く入った可能性がある（nonCachedInputTokens / maxNonCachedInputTokens）。",
  userMessage:
    "ユーザーから Codex への入力。最初の依頼、追加指示、仕様変更、確認依頼などを追うための出来事。",
  codexStatus:
    "Codex の途中説明、計画、判断、検証報告など。作業方針や状況認識の変化を追うための出来事。",
  tool: "Codex が実行したツール利用。コマンド実行、ファイル読み取り、検索、パッチ適用などを含む。出力が大きいと、その後の入力増加と関連することがある。",
  tokenCount:
    "token 使用量を記録した計測イベント。入力、キャッシュされた入力、出力、合計 token などを含む。使用量が増えたタイミングを確認する基準点。",
} as const;

const help = (text: string): string =>
  `<button class="help" type="button" aria-label="${text}" data-tip="${text}">?</button>`;

export const serverHtml = (): string => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>codex-token-trace session timeline explorer</title>
    <style>
      :root {
        color-scheme: dark;
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
        --cyan: #22d3ee;
        --pink: #f472b6;
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

      main { max-width: 1280px; margin: 0 auto; padding: 32px 20px 48px; }
      header { display: flex; flex-wrap: wrap; gap: 16px; align-items: end; justify-content: space-between; margin-bottom: 20px; }
      h1 { margin: 0; font-size: clamp(1.6rem, 3vw, 2.7rem); letter-spacing: -0.04em; }
      .muted { color: var(--muted); }

      .legend { display: flex; flex-wrap: wrap; gap: 12px 14px; margin: 8px 0 16px; color: var(--muted); font-size: 0.92rem; }
      .legend-item { display: inline-flex; align-items: center; gap: 8px; }
      .swatch { width: 12px; height: 12px; border-radius: 999px; display: inline-block; }
      .axis-labels { display: flex; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 0.86rem; padding: 0 18px 10px; }

      .grid { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 16px; }
      .card { background: linear-gradient(180deg, var(--panel), var(--panel-2)); border: 1px solid var(--line); border-radius: 20px; box-shadow: 0 24px 80px rgba(2, 6, 23, 0.42); overflow: hidden; }
      .card h2 { margin: 0; padding: 16px 18px 8px; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); }
      .canvas-wrap { padding: 0 18px 18px; position: relative; }
      canvas { width: 100%; height: 360px; display: block; cursor: crosshair; }
      .tooltip { position: fixed; z-index: 20; pointer-events: none; max-width: 360px; white-space: pre-wrap; background: rgba(2, 6, 23, 0.96); border: 1px solid rgba(148, 163, 184, 0.32); border-radius: 12px; padding: 10px 12px; color: var(--text); box-shadow: 0 18px 54px rgba(2, 6, 23, 0.56); font-size: 0.84rem; line-height: 1.45; display: none; }
      .help { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 999px; border: 1px solid rgba(148, 163, 184, 0.38); background: rgba(15, 23, 42, 0.8); color: var(--muted); cursor: help; font-size: 0.72rem; padding: 0; }

      .meta { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; padding: 0 18px 18px; }
      .stat { background: rgba(15, 23, 42, 0.56); border: 1px solid var(--line); border-radius: 16px; padding: 12px; }
      .stat .label { color: var(--muted); font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.12em; display: flex; align-items: center; gap: 6px; }
      .stat .value { margin-top: 6px; font-size: 1.25rem; font-variant-numeric: tabular-nums; }

      .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px 0; }
      .toolbar button, .detail button { appearance: none; border: 1px solid var(--line); border-radius: 999px; background: rgba(15, 23, 42, 0.72); color: var(--text); padding: 8px 12px; cursor: pointer; }
      .toolbar button:disabled { opacity: 0.45; cursor: not-allowed; }
      .table-wrap { overflow: auto; max-height: 620px; }
      table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
      thead th { position: sticky; top: 0; background: rgba(15, 23, 42, 0.98); text-align: left; color: var(--muted); font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.12em; padding: 12px 14px; border-bottom: 1px solid var(--line); }
      tbody td { padding: 11px 14px; border-bottom: 1px solid rgba(148, 163, 184, 0.12); vertical-align: top; }
      tbody tr { cursor: pointer; }
      tbody tr:hover, tbody tr.selected { background: rgba(96, 165, 250, 0.09); }
      .kind { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
      .pill { border-radius: 999px; padding: 3px 8px; background: rgba(148, 163, 184, 0.16); color: var(--text); font-size: 0.72rem; }
      pre { margin: 0; padding: 18px; overflow: auto; max-height: 620px; white-space: pre-wrap; word-break: break-word; font-size: 0.88rem; line-height: 1.5; }
      .detail-empty { padding: 18px; color: var(--muted); }
      .detail-heading { padding: 18px 18px 0; color: var(--muted); }
      .detail-summary { padding: 8px 18px 0; white-space: pre-wrap; line-height: 1.5; }

      @media (max-width: 980px) { .grid, .meta { grid-template-columns: 1fr; } }
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
        <span class="legend-item"><span class="swatch" style="background:#60a5fa"></span>total progress ${help(legendTooltips.totalProgress)}</span>
        <span class="legend-item"><span class="swatch" style="background:#f59e0b"></span>context pressure ${help(legendTooltips.contextPressure)}</span>
        <span class="legend-item"><span class="swatch" style="background:#34d399"></span>non-cached pressure ${help(legendTooltips.nonCachedPressure)}</span>
        <span class="legend-item"><span class="swatch" style="background:#22d3ee"></span>user message ${help(legendTooltips.userMessage)}</span>
        <span class="legend-item"><span class="swatch" style="background:#f472b6"></span>Codex status ${help(legendTooltips.codexStatus)}</span>
        <span class="legend-item"><span class="swatch" style="background:#fb923c"></span>tool ${help(legendTooltips.tool)}</span>
        <span class="legend-item"><span class="swatch" style="background:#e2e8f0"></span>token_count ${help(legendTooltips.tokenCount)}</span>
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
        <div class="stat"><div class="label">total tokens ${help(summaryTooltips.totalTokens)}</div><div class="value" id="total-tokens">0</div></div>
        <div class="stat"><div class="label">max non-cached input ${help(summaryTooltips.maxNonCachedInput)}</div><div class="value" id="max-non-cached">0</div></div>
        <div class="stat"><div class="label">max context usage ${help(summaryTooltips.maxContextUsage)}</div><div class="value" id="max-context">0%</div></div>
        <div class="stat"><div class="label">compactions ${help(summaryTooltips.compactions)}</div><div class="value" id="compactions">0</div></div>
        <div class="stat"><div class="label">events ${help(summaryTooltips.events)}</div><div class="value" id="events-count">0</div></div>
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
        { key: 'totalProgress', name: 'total progress', color: '#60a5fa', description: ${JSON.stringify(legendTooltips.totalProgress)} },
        { key: 'contextPressure', name: 'context pressure', color: '#f59e0b', description: ${JSON.stringify(legendTooltips.contextPressure)} },
        { key: 'nonCachedPressure', name: 'non-cached pressure', color: '#34d399', description: ${JSON.stringify(legendTooltips.nonCachedPressure)} },
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
        const detail = await getJson('/api/events/' + line);
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
        const data = await getJson('/api/session');
        state.session = data;
        document.getElementById('total-tokens').textContent = fmt(data.summary.finalTotalTokens);
        document.getElementById('max-non-cached').textContent = fmt(data.summary.maxNonCachedInputTokens);
        document.getElementById('max-context').textContent = pct((data.summary.maxContextUsageRatio ?? 0) * 100);
        document.getElementById('compactions').textContent = fmt(data.summary.compactionCount);
        document.getElementById('events-count').textContent = fmt(data.session.events);
        drawGraph(data.pressureSeries, data.markers, data.timelineLaneEvents);
      }

      async function loadEvents() {
        const data = await getJson('/api/events?offset=' + state.offset + '&limit=' + state.limit);
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
