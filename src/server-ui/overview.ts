import { help } from "./shared.js";
import { overviewTooltips } from "./tooltips.js";

export const overviewHtml = (): string => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Multi-session overview</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #08111f;
        --panel: rgba(15, 23, 42, 0.92);
        --panel-strong: rgba(15, 23, 42, 0.98);
        --border: rgba(148, 163, 184, 0.2);
        --muted: #94a3b8;
        --text: #e2e8f0;
        --accent: #7dd3fc;
        --pink: #ff4d8d;
        --purple: #b794f4;
        --green: #4ade80;
        --blue: #60a5fa;
        --amber: #f59e0b;
        --adjust: #fcd34d;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(96, 165, 250, 0.18), transparent 32%),
          radial-gradient(circle at right top, rgba(236, 72, 153, 0.14), transparent 26%),
          linear-gradient(180deg, #06101d 0%, #0b1322 100%);
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main { max-width: 1600px; margin: 0 auto; padding: 24px; }
      header {
        display: flex;
        gap: 16px;
        justify-content: space-between;
        align-items: end;
        margin-bottom: 18px;
      }
      h1 {
        margin: 0;
        font-size: clamp(2rem, 4vw, 3.25rem);
        letter-spacing: -0.04em;
      }
      .muted { color: var(--muted); }
      .header-actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
      }
      .scale {
        display: grid;
        gap: 6px;
        min-width: 240px;
      }
      .scale label {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        color: var(--muted);
        font-size: 0.85rem;
      }
      .scale output { color: var(--text); font-weight: 650; }
      input[type="range"] { width: 100%; }
      a { color: #93c5fd; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .summary {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 18px;
      }
      .card, .panel, .detail, .table-shell {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 18px;
        box-shadow: 0 20px 50px rgba(2, 6, 23, 0.34);
      }
      .card {
        padding: 14px 16px;
        min-height: 110px;
        display: grid;
        gap: 8px;
      }
      .card-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
        color: var(--muted);
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }
      .value {
        font-size: clamp(1.4rem, 2.4vw, 2.4rem);
        font-weight: 760;
        letter-spacing: -0.04em;
        font-variant-numeric: tabular-nums;
      }
      .help {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.44);
        background: transparent;
        color: var(--muted);
        font-size: 0.7rem;
        cursor: help;
      }
      .legend, .axis-labels {
        display: flex;
        flex-wrap: wrap;
        gap: 14px 16px;
        align-items: center;
      }
      .legend {
        margin: 18px 0 10px;
        padding: 14px 16px;
        background: rgba(15, 23, 42, 0.76);
        border: 1px solid var(--border);
        border-radius: 16px;
      }
      .legend-item {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--text);
        font-size: 0.88rem;
      }
      .swatch {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        display: inline-block;
      }
.chart-shell {
  position: relative;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 14px 0 6px;
  border-radius: 18px;
}
.chart-spacer {
  position: relative;
  height: 380px;
}
.chart {
  position: sticky;
  left: 0;
  display: block;
  width: 100%;
  height: 380px;
  cursor: crosshair;
}
      .axis-labels {
        justify-content: space-between;
        padding: 0 8px 8px;
        color: var(--muted);
        font-size: 0.86rem;
      }
      .grid {
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.9fr);
        gap: 16px;
        margin-top: 18px;
      }
      .panel {
        padding: 14px;
      }
      .table-shell {
        overflow: hidden;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      thead th {
        text-align: left;
        padding: 12px 14px;
        color: var(--muted);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        border-bottom: 1px solid rgba(148, 163, 184, 0.14);
      }
      tbody td {
        padding: 11px 14px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.12);
        font-variant-numeric: tabular-nums;
      }
      tbody tr {
        cursor: pointer;
      }
      tbody tr:hover, tbody tr.selected {
        background: rgba(96, 165, 250, 0.09);
      }
      .detail-empty {
        padding: 18px;
        color: var(--muted);
      }
      .detail h2 {
        margin: 0 0 10px;
        font-size: 1.1rem;
      }
      .detail pre {
        margin: 0;
        padding: 14px 0 0;
        color: var(--text);
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.5;
      }
      .tooltip {
        position: fixed;
        z-index: 20;
        pointer-events: none;
        max-width: 360px;
        background: var(--panel-strong);
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 12px;
        padding: 10px 12px;
        box-shadow: 0 18px 54px rgba(2, 6, 23, 0.56);
        font-size: 0.84rem;
        line-height: 1.45;
        display: none;
        white-space: pre-wrap;
      }
      .mono { font-variant-numeric: tabular-nums; }
      @media (max-width: 1100px) {
        .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Multi-session overview</h1>
          <div class="muted">Time-based stacked bars with events and compactions overlaid.</div>
        </div>
        <div class="header-actions">
          <div class="scale">
            <label for="scale">
              <span>time scale</span>
              <output id="scale-value">24 px/hour</output>
            </label>
            <input id="scale" type="range" min="8" max="56" step="2" value="24" />
          </div>
          <div class="muted"><a href="/">Open session timeline</a></div>
        </div>
      </header>

      <section class="summary" aria-label="summary cards">
        <article class="card">
          <div class="card-head"><span>sessions ${help(overviewTooltips.sessions)}</span></div>
          <div class="value" id="summary-sessions">—</div>
        </article>
        <article class="card">
          <div class="card-head"><span>total tokens ${help(overviewTooltips.totalTokens)}</span></div>
          <div class="value" id="summary-total-tokens">—</div>
        </article>
        <article class="card">
          <div class="card-head"><span>median/session ${help(overviewTooltips.medianSession)}</span></div>
          <div class="value" id="summary-median">—</div>
        </article>
        <article class="card">
          <div class="card-head"><span>max events ${help(overviewTooltips.maxEvents)}</span></div>
          <div class="value" id="summary-max-events">—</div>
        </article>
        <article class="card">
          <div class="card-head"><span>sessions with compaction ${help(overviewTooltips.sessionsWithCompaction)}</span></div>
          <div class="value" id="summary-compactions">—</div>
        </article>
      </section>

      <section class="legend" aria-label="legend">
        <span class="legend-item"><span class="swatch" style="background:#60a5fa"></span>non-cached input ${help(overviewTooltips.nonCachedInput)}</span>
        <span class="legend-item"><span class="swatch" style="background:#f59e0b"></span>cached input ${help(overviewTooltips.cachedInput)}</span>
        <span class="legend-item"><span class="swatch" style="background:#4ade80"></span>visible output ${help(overviewTooltips.visibleOutput)}</span>
        <span class="legend-item"><span class="swatch" style="background:#7dd3fc"></span>reasoning output ${help(overviewTooltips.reasoningOutput)}</span>
        <span class="legend-item"><span class="swatch" style="background:#fcd34d"></span>adjustment ${help(overviewTooltips.adjustment)}</span>
        <span class="legend-item"><span class="swatch" style="background:#ff4d8d"></span>events ${help(overviewTooltips.events)}</span>
        <span class="legend-item"><span class="swatch" style="background:#b794f4"></span>compactions ${help(overviewTooltips.compactions)}</span>
      </section>

      <div class="axis-labels">
        <span>X: session start time</span>
        <span>Y (left): total tokens</span>
        <span>Y (right): events</span>
      </div>

      <div class="panel chart-shell" id="chart-scroll">
        <div class="chart-spacer" id="chart-spacer">
          <canvas id="chart" class="chart"></canvas>
        </div>
      </div>

      <section class="grid">
        <div class="table-shell">
          <table>
            <thead>
              <tr>
                <th>time</th>
                <th>session</th>
                <th>total</th>
                <th>events</th>
                <th>compactions</th>
                <th>dominant</th>
              </tr>
            </thead>
            <tbody id="ranking-body">
              <tr><td colspan="6" class="detail-empty">Loading…</td></tr>
            </tbody>
          </table>
        </div>
        <aside class="detail panel" id="detail">
          <div class="detail-empty">Select a session to inspect its summary.</div>
        </aside>
      </section>
    </main>

    <div class="tooltip" id="tooltip" role="tooltip"></div>
    <script>
      const tooltip = document.getElementById('tooltip');
      const chart = document.getElementById('chart');
      const scrollArea = document.getElementById('chart-scroll');
      const chartSpacer = document.getElementById('chart-spacer');
      const scaleInput = document.getElementById('scale');
      const scaleValue = document.getElementById('scale-value');
      const rankingBody = document.getElementById('ranking-body');
      const detail = document.getElementById('detail');

      const state = {
        data: null,
        selectedSessionId: null,
        pxPerHour: Number(scaleInput.value),
        hoverHits: [],
      };

      const fmtInt = (value) => new Intl.NumberFormat('en-US').format(value);
      const fmtPct = (value) => value === null || value === undefined ? '—' : Number(value).toFixed(1) + '%';
      const esc = (value) => String(value).replace(/[&<>"']/g, (match) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[match]));
      const parseTime = (value) => {
        const time = value ? Date.parse(value) : NaN;
        return Number.isFinite(time) ? time : null;
      };
      const colorBySegment = {
        non_cached_input: '#60a5fa',
        cached_input: '#f59e0b',
        visible_output: '#4ade80',
        reasoning_output: '#7dd3fc',
        adjustment: '#fcd34d',
      };
      const labelBySegment = {
        non_cached_input: 'non-cached input',
        cached_input: 'cached input',
        visible_output: 'visible output',
        reasoning_output: 'reasoning output',
        adjustment: 'adjustment',
      };

      const apiPath = (path) => path;

      const showTooltip = (text, event) => {
        tooltip.textContent = text;
        tooltip.style.display = 'block';
        tooltip.style.left = Math.max(8, event.clientX + 14) + 'px';
        tooltip.style.top = Math.max(8, event.clientY + 14) + 'px';
      };

      const hideTooltip = () => {
        tooltip.style.display = 'none';
      };

      const setSummary = (summary) => {
        document.getElementById('summary-sessions').textContent = fmtInt(summary.sessions);
        document.getElementById('summary-total-tokens').textContent = fmtInt(summary.totalTokens);
        document.getElementById('summary-median').textContent = summary.medianTotalTokens === null ? '—' : fmtInt(summary.medianTotalTokens);
        document.getElementById('summary-max-events').textContent = summary.maxEvents === null ? '—' : fmtInt(summary.maxEvents);
        document.getElementById('summary-compactions').textContent = fmtInt(summary.sessionsWithCompaction);
      };

      const setDetail = (sessionId) => {
        const session = state.data.sessions.find((item) => item.sessionId === sessionId);
        if (!session) {
          return;
        }
        state.selectedSessionId = sessionId;
        rankingBody.querySelectorAll('tr').forEach((row) => {
          row.classList.toggle('selected', row.dataset.sessionId === sessionId);
        });

        detail.innerHTML = [
          '<h2>' + esc(session.path) + '</h2>',
          '<div class="muted mono">' + esc(session.sessionId) + '</div>',
          '<pre>',
          'startedAt: ' + esc(session.startedAt ?? 'null'),
          '\\nendedAt: ' + esc(session.endedAt ?? 'null'),
          '\\nfinalTotalTokens: ' + esc(session.finalTotalTokens ?? 'null'),
          '\\nfinalInputTokens: ' + esc(session.finalInputTokens ?? 'null'),
          '\\nfinalCachedInputTokens: ' + esc(session.finalCachedInputTokens ?? 'null'),
          '\\nfinalOutputTokens: ' + esc(session.finalOutputTokens ?? 'null'),
          '\\nfinalReasoningOutputTokens: ' + esc(session.finalReasoningOutputTokens ?? 'null'),
          '\\nnonCachedInputTokens: ' + esc(session.nonCachedInputTokens ?? 'null'),
          '\\nvisibleOutputTokens: ' + esc(session.visibleOutputTokens ?? 'null'),
          '\\nadjustmentTokens: ' + esc(session.adjustmentTokens ?? 'null'),
          '\\nbreakdownMismatchTokens: ' + esc(session.breakdownMismatchTokens ?? 'null'),
          '\\nevents: ' + esc(session.events),
          '\\ncompactions: ' + esc(session.compactions),
          '\\nlikelyDriver: ' + esc(session.likelyDriver ?? 'null'),
          '\\ntopCommandPreview: ' + esc(session.topCommandPreview ?? 'null'),
          '</pre>',
          '<p><a href="/?session=' + encodeURIComponent(session.sessionId) + '">Open session timeline</a></p>',
        ].join('');
      };

      const buildRankingRow = (session) => {
        const row = document.createElement('tr');
        row.dataset.sessionId = session.sessionId;
        row.innerHTML = [
          '<td>' + esc(session.startedAt ?? '—') + '</td>',
          '<td>' + esc(session.path) + '<div class="muted mono">' + esc(session.sessionId) + '</div></td>',
          '<td>' + esc(session.finalTotalTokens ?? '—') + '</td>',
          '<td>' + esc(session.events) + '</td>',
          '<td>' + esc(session.compactions) + '</td>',
          '<td>' + esc(session.dominantPart) + '</td>',
        ].join('');
        row.addEventListener('click', () => setDetail(session.sessionId));
        row.addEventListener('mouseenter', (event) => {
          showTooltip(
            'sessionId: ' + session.sessionId + '\\nstartedAt: ' + (session.startedAt ?? 'null') + '\\ntotalTokens: ' + (session.finalTotalTokens ?? 'null') + '\\nevents: ' + session.events + '\\ncompactions: ' + session.compactions,
            event,
          );
        });
        row.addEventListener('mousemove', (event) => {
          showTooltip(
            'sessionId: ' + session.sessionId + '\\nstartedAt: ' + (session.startedAt ?? 'null') + '\\ntotalTokens: ' + (session.finalTotalTokens ?? 'null') + '\\nevents: ' + session.events + '\\ncompactions: ' + session.compactions,
            event,
          );
        });
        row.addEventListener('mouseleave', hideTooltip);
        return row;
      };

      const renderRankingTable = () => {
        rankingBody.innerHTML = '';
        const ranked = [...state.data.sessions].sort(
          (a, b) => (b.finalTotalTokens ?? 0) - (a.finalTotalTokens ?? 0),
        );
        for (const session of ranked) {
          rankingBody.appendChild(buildRankingRow(session));
        }
      };

      const drawAxes = (ctx, width, height, leftPad, rightPad, plotHeight, maxTokens, maxEvents, domainStart, domainEnd, tickHours) => {
        const formatTickLabel = (timestamp) => {
          const date = new Date(timestamp);
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hour = String(date.getHours()).padStart(2, '0');
          return month + '/' + day + ' ' + hour + ':00';
        };
        const domainWidth = Math.max(1, domainEnd - domainStart);
        const tickMs = tickHours * 3_600_000;
        const firstTick = Math.ceil(domainStart / tickMs) * tickMs;

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px ui-sans-serif, system-ui';
        ctx.lineWidth = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.beginPath();
        ctx.moveTo(leftPad, 18);
        ctx.lineTo(leftPad, plotHeight);
        ctx.lineTo(width - rightPad, plotHeight);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
        for (let time = firstTick; time <= domainEnd; time += tickMs) {
          const x = leftPad + ((time - domainStart) / domainWidth) * (width - leftPad - rightPad);
          ctx.beginPath();
          ctx.moveTo(x, 18);
          ctx.lineTo(x, plotHeight);
          ctx.stroke();
          ctx.fillText(formatTickLabel(time), x, plotHeight + 8);
        }
      };

      const renderChart = () => {
        const sessions = state.data.sessions.filter((session) => session.startedAt !== null);
        const times = sessions.map((session) => parseTime(session.startedAt)).filter((value) => value !== null);
        const totals = sessions.map((session) => session.finalTotalTokens ?? 0);
        const maxTotal = Math.max(1, ...totals);
        const maxEvents = Math.max(1, ...state.data.sessions.map((session) => session.events));
        const start = times.length === 0 ? Date.now() : Math.min(...times);
        const end = times.length === 0 ? start + 3600_000 : Math.max(...times);
        const marginMs = 3 * 3_600_000;
        const domainStart = start - marginMs;
        const domainEnd = end + marginMs;
        const durationHours = Math.max(1, (domainEnd - domainStart) / 3_600_000);
        const tickHours =
          state.pxPerHour <= 10 ? 24 : state.pxPerHour <= 16 ? 12 : state.pxPerHour <= 28 ? 6 : 3;
        const plotWidth = Math.max(960, Math.ceil(durationHours * state.pxPerHour) + 48);
        const leftPad = 56;
        const rightPad = 60;
        const plotHeight = 292;
        const chartWidth = leftPad + plotWidth + rightPad;
        const chartHeight = 380;
        const viewportWidth = Math.floor(scrollArea.clientWidth);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (viewportWidth <= 0 || chartHeight <= 0) return;

        chartSpacer.style.width = chartWidth + 'px';
        chart.style.width = viewportWidth + 'px';
        chart.style.height = chartHeight + 'px';
        chart.width = Math.round(viewportWidth * dpr);
        chart.height = Math.round(chartHeight * dpr);
        const scrollLeft = Math.max(0, scrollArea.scrollLeft);

        const ctx = chart.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context is not available');
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, viewportWidth, chartHeight);
        ctx.fillStyle = '#030712';
        ctx.fillRect(0, 0, viewportWidth, chartHeight);
        ctx.save();
        ctx.translate(-scrollLeft, 0);

        drawAxes(
        ctx,
        chartWidth,
        chartHeight,
        leftPad,
        rightPad,
        plotHeight,
        maxTotal,
        maxEvents,
        domainStart,
        domainEnd,
        tickHours,
      );

        const hits = [];
        const ordered = [...state.data.sessions]
          .filter((session) => session.startedAt !== null)
          .sort((a, b) => parseTime(a.startedAt) - parseTime(b.startedAt));

        const xFor = (session) => {
          const time = parseTime(session.startedAt);
          if (time === null) return leftPad;
          const ratio = domainEnd === domainStart ? 0 : (time - domainStart) / (domainEnd - domainStart);
          return leftPad + ratio * plotWidth;
        };

        ctx.strokeStyle = 'rgba(255, 77, 141, 0.55)';
        ctx.fillStyle = '#ff4d8d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ordered.forEach((session, index) => {
          const x = xFor(session);
          const y = plotHeight - (session.events / maxEvents) * plotHeight;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        ordered.forEach((session) => {
          const x = xFor(session);
          const y = plotHeight - (session.events / maxEvents) * plotHeight;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
          hits.push({
            type: 'events',
            sessionId: session.sessionId,
            x: x - scrollLeft - 6,
            y: y - 6,
            width: 12,
            height: 12,
            text:
              'sessionId: ' + session.sessionId + '\\nstartedAt: ' + (session.startedAt ?? 'null') + '\\nevents: ' + session.events + '\\nevent count は totalTokens には直接含まれないが、作業の細かさや長さの手がかりになる',
          });
        });

        ordered.forEach((session) => {
          const x = xFor(session);
          const total = session.finalTotalTokens ?? 0;
          const barHeight = (total / maxTotal) * plotHeight;
          let currentTop = plotHeight - barHeight;
          const barWidth = Math.max(10, Math.min(22, plotWidth / Math.max(12, state.data.sessions.length * 2)));
          const segments = [
            ['non_cached_input', Math.max(0, session.nonCachedInputTokens ?? 0)],
            ['cached_input', Math.max(0, session.finalCachedInputTokens ?? 0)],
            ['visible_output', Math.max(0, session.visibleOutputTokens ?? 0)],
            ['reasoning_output', Math.max(0, session.finalReasoningOutputTokens ?? 0)],
            ['adjustment', Math.max(0, session.adjustmentTokens ?? 0)],
          ];
          let remaining = total;
          for (const [segment, value] of segments) {
            const drawValue = Math.min(value, remaining);
            const segmentHeight = (drawValue / maxTotal) * plotHeight;
            ctx.fillStyle = colorBySegment[segment];
            ctx.fillRect(x - barWidth / 2, currentTop, barWidth, segmentHeight);
            hits.push({
              type: 'segment',
              sessionId: session.sessionId,
              segment,
              value: drawValue,
              x: x - scrollLeft - barWidth / 2,
              y: currentTop,
              width: barWidth,
              height: segmentHeight,
              text:
                'sessionId: ' + session.sessionId +
                '\\nstartedAt: ' + (session.startedAt ?? 'null') +
                '\\nsegment name: ' + labelBySegment[segment] +
                '\\nsegment value: ' + drawValue +
                '\\nreported totalTokens: ' + (session.finalTotalTokens ?? 'null') +
                '\\nknown breakdown sum: ' + esc(String(session.knownBreakdownTokens ?? 'null')) +
                '\\nbreakdown mismatch: ' + (session.breakdownMismatchTokens ?? 'null') +
                '\\nevents: ' + session.events +
                '\\ncompactions: ' + session.compactions +
                '\\nlikelyDriver: ' + (session.likelyDriver ?? 'null') +
                '\\ntopCommandPreview: ' + (session.topCommandPreview ?? 'null'),
            });
            currentTop += segmentHeight;
            remaining -= drawValue;
          }
          ctx.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx.strokeRect(x - barWidth / 2, plotHeight - barHeight, barWidth, barHeight);

          const compactionCount = session.compactions;
          for (let i = 0; i < compactionCount; i++) {
            const cy = Math.max(20, plotHeight - barHeight - 12 - i * 8);
            ctx.fillStyle = '#b794f4';
            ctx.beginPath();
            ctx.arc(x, cy, 3, 0, Math.PI * 2);
            ctx.fill();
          }
          if (compactionCount > 0) {
            hits.push({
              type: 'compactions',
              sessionId: session.sessionId,
              x: x - scrollLeft - 10,
              y: Math.max(8, plotHeight - barHeight - 22 - (compactionCount - 1) * 8),
              width: 20,
              height: 24 + Math.max(0, compactionCount - 1) * 8,
              text:
                'sessionId: ' + session.sessionId + '\\nstartedAt: ' + (session.startedAt ?? 'null') + '\\ncompactions: ' + session.compactions + '\\ncompaction は長くなった文脈を圧縮したタイミング',
            });
          }
        });

        state.hoverHits = hits;
        ctx.restore();
      };

      const hitTest = (event) => {
        const rect = chart.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        return state.hoverHits.find((hit) => x >= hit.x && x <= hit.x + hit.width && y >= hit.y && y <= hit.y + hit.height) ?? null;
      };

      chart.addEventListener('mousemove', (event) => {
        const hit = hitTest(event);
        if (!hit) {
          hideTooltip();
          return;
        }
        showTooltip(hit.text, event);
      });
      chart.addEventListener('mouseleave', hideTooltip);
      chart.addEventListener('click', (event) => {
        const hit = hitTest(event);
        if (!hit) return;
        setDetail(hit.sessionId);
      });

      document.querySelectorAll('[data-tip].help').forEach((node) => {
        node.addEventListener('mouseenter', (event) => showTooltip(node.dataset.tip, event));
        node.addEventListener('mousemove', (event) => showTooltip(node.dataset.tip, event));
        node.addEventListener('mouseleave', hideTooltip);
      });

      const safeRenderChart = () => {
        try {
          renderChart();
        } catch (error) {
          console.error(error);
          detail.innerHTML =
            '<div class="detail-empty">Failed to render overview chart: ' +
            esc(error instanceof Error ? error.message : String(error)) +
            '</div>';
        }
      };

      let pendingRenderFrame = null;
      const scheduleRenderChart = () => {
        if (pendingRenderFrame !== null) {
          return;
        }
        pendingRenderFrame = requestAnimationFrame(() => {
          pendingRenderFrame = null;
          safeRenderChart();
        });
      };

      scaleInput.addEventListener('input', () => {
        state.pxPerHour = Number(scaleInput.value);
        scaleValue.textContent = state.pxPerHour + ' px/hour';
        scheduleRenderChart();
      });

      scrollArea.addEventListener('scroll', scheduleRenderChart);
      window.addEventListener('resize', scheduleRenderChart);

      const loadOverview = async () => {
        const response = await fetch(apiPath('/api/sessions/overview'));
        if (!response.ok) {
          throw new Error('Request failed: ' + response.status);
        }
        state.data = await response.json();
        setSummary(state.data.summary);
        renderRankingTable();
        scheduleRenderChart();
        const first = [...state.data.sessions].sort(
          (a, b) => (b.finalTotalTokens ?? 0) - (a.finalTotalTokens ?? 0),
        )[0];
        if (first) {
          setDetail(first.sessionId);
        }
      };

      loadOverview().catch((error) => {
        rankingBody.innerHTML = '<tr><td colspan="6" class="detail-empty">Failed to load overview: ' + esc(error.message) + '</td></tr>';
      });
    </script>
  </body>
</html>
`;
