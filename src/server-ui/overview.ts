import { overviewCss } from "./assets.js";
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
${overviewCss()}
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
