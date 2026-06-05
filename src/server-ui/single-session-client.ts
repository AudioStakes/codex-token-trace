import { singleSessionTooltips } from "./tooltips.js";

export const singleSessionClientScript = (): string =>
  String.raw`
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
        return hit.series.name + '\\\\n' +
          'time: ' + timeText(p.timestamp) + '\\\\n' +
          'value: ' + pct(p[hit.series.key]) + '\\\\n\\\\n' +
          'raw values:\\\\n' +
          'inputTokens: ' + fmt(p.inputTokens) + '\\\\n' +
          'cachedInputTokens: ' + fmt(p.cachedInputTokens) + '\\\\n' +
          'nonCachedInputTokens: ' + fmt(p.nonCachedInputTokens) + '\\\\n' +
          'outputTokens: ' + fmt(p.outputTokens) + '\\\\n' +
          'reasoningOutputTokens: ' + fmt(p.reasoningOutputTokens) + '\\\\n' +
          'totalTokens: ' + fmt(p.totalTokens) + '\\\\n' +
          'contextWindow: ' + fmt(p.contextWindow) + '\\\\n\\\\n' +
          'description:\\\\n' + hit.series.description;
      }

      function eventText(event) {
        return event.kind + '\\\\n' + 'time: ' + timeText(event.timestamp) + '\\\\n' + 'title: ' + event.title + '\\\\n' + 'preview: ' + event.preview;
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
        return '<pre id="' + id + '">' + esc(clipped ? text.slice(0, 5000) + '\\\\n…(truncated)' : text) + '</pre>' + (clipped ? '<button data-full="' + id + '">Show full</button>' : '');
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
`.trim();
