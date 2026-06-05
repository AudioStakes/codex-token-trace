export const overviewClientScript = (): string => String.raw`
const tooltip = document.getElementById('tooltip');
const chart = document.getElementById('chart');
const chartError = document.getElementById('chart-error');
const scrollArea = document.getElementById('chart-scroll');
const scaleInput = document.getElementById('scale');
const scaleValue = document.getElementById('scale-value');
const rankingBody = document.getElementById('ranking-body');
const chartSpacer = document.getElementById('chart-spacer');

const state = {
  data: null,
  pxPerHour: Number(scaleInput.value),
  hoverHits: [],
  hoveredSessionId: null,
  selectedSessionId: null,
  visibleSessionIds: new Set(),
  leftmostVisibleSessionId: null,
  lastScrolledSessionId: null,
};

const fmtInt = (value) => new Intl.NumberFormat('en-US').format(value);

const fmtCompact = (value) => {
  if (value >= 1_000_000) {
    return value % 1_000_000 === 0 ? value / 1_000_000 + 'M' : (Math.round(value / 100_000) / 10) + 'M';
  }
  if (value >= 1_000) {
    return value % 1_000 === 0 ? value / 1_000 + 'k' : (Math.round(value / 100) / 10) + 'k';
  }
  return String(Math.round(value));
};

const fmtTime = (timestamp) => {
  const date = new Date(timestamp);
  const parts = new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const month = parts.find((part) => part.type === 'month')?.value ?? '??';
  const day = parts.find((part) => part.type === 'day')?.value ?? '??';
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '??';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return month + '/' + day + ' ' + hour + ':' + minute;
};

const parseTime = (timestamp) => {
  if (timestamp === null || timestamp === undefined) {
    return null;
  }

  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : null;
};

const esc = (value) => String(value).replace(/[&<>"']/g, (match) => {
  switch (match) {
    case '&':
      return '&amp;';
    case '<':
      return '&lt;';
    case '>':
      return '&gt;';
    case '"':
      return '&quot;';
    case "'":
      return '&#39;';
    default:
      return match;
  }
});

const displayPath = (path) => String(path).replace(/^\/Users\/satoudaisuke(?=\/|$)/, '~');

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
  tooltip.hidden = false;
  tooltip.style.left = Math.min(window.innerWidth - 20, event.clientX + 14) + 'px';
  tooltip.style.top = Math.min(window.innerHeight - 20, event.clientY + 14) + 'px';
};

const hideTooltip = () => {
  tooltip.hidden = true;
};

const showChartError = (error) => {
  if (!chartError) {
    return;
  }

  chartError.hidden = false;
  chartError.textContent =
    'Failed to render chart: ' + (error instanceof Error ? error.message : String(error));
};

const clearChartError = () => {
  if (!chartError) {
    return;
  }

  chartError.hidden = true;
  chartError.textContent = '';
};

const getRows = () => Array.from(rankingBody.querySelectorAll('tr[data-session-id]'));

const findRowBySessionId = (sessionId) => getRows().find((row) => row.dataset.sessionId === sessionId) ?? null;

const updateRowClasses = () => {
  getRows().forEach((row) => {
    const sessionId = row.dataset.sessionId;
    row.classList.toggle('visible-in-chart', state.visibleSessionIds.has(sessionId));
    row.classList.toggle('hovered-session', state.hoveredSessionId === sessionId);
    row.classList.toggle('selected-session', state.selectedSessionId === sessionId);
  });
};

const scheduleRowScroll = () => {
  if (!state.leftmostVisibleSessionId || state.leftmostVisibleSessionId === state.lastScrolledSessionId) {
    return;
  }
  const sessionId = state.leftmostVisibleSessionId;
  requestAnimationFrame(() => {
    const row = findRowBySessionId(sessionId);
    if (row) {
      row.scrollIntoView({ block: 'nearest' });
      state.lastScrolledSessionId = sessionId;
    }
  });
};

const setHoveredSessionId = (sessionId) => {
  state.hoveredSessionId = sessionId;
  updateRowClasses();
};

const setSelectedSessionId = (sessionId) => {
  state.selectedSessionId = sessionId;
  state.hoveredSessionId = sessionId;
  updateRowClasses();
};

const setSummary = (summary) => {
  document.getElementById('summary-sessions').textContent = fmtInt(summary.sessions);
  document.getElementById('summary-tokens').textContent = fmtInt(summary.totalTokens);
  document.getElementById('summary-median').textContent = fmtInt(summary.medianTotalTokens);
  document.getElementById('summary-events').textContent = fmtInt(summary.maxEvents);
  document.getElementById('summary-compactions').textContent = fmtInt(summary.sessionsWithCompaction);
};

const renderRankingTable = () => {
  const sessions = [...state.data.sessions].sort(
    (a, b) =>
      (b.finalTotalTokens ?? 0) - (a.finalTotalTokens ?? 0) ||
      String(a.startedAt ?? '').localeCompare(String(b.startedAt ?? '')) ||
      a.sessionId.localeCompare(b.sessionId),
  );

  const cells = sessions.map((session) => {
    const totalTokens = session.finalTotalTokens ?? 0;
    const likelyDriver = session.likelyDriver ?? '—';
    const topCommandPreview = session.topCommandPreview ?? '—';
    const dominant = labelBySegment[session.dominantPart] ?? session.dominantPart;
    const startedAt = session.startedAt ? fmtTime(session.startedAt) : '—';
    const path = displayPath(session.path);
    return '<tr data-session-id="' + esc(session.sessionId) + '">' +
      '<td class="mono">' + esc(startedAt) + '</td>' +
      '<td class="session-cell">' +
        '<div class="session-path" title="' + esc(path) + '">' + esc(path) + '</div>' +
        '<div class="session-id mono" title="' + esc(session.sessionId) + '">' + esc(session.sessionId) + '</div>' +
      '</td>' +
      '<td class="mono numeric">' + fmtInt(totalTokens) + '</td>' +
      '<td class="mono numeric">' + fmtInt(Math.max(0, session.nonCachedInputTokens ?? 0)) + '</td>' +
      '<td class="mono numeric">' + fmtInt(Math.max(0, session.finalCachedInputTokens ?? 0)) + '</td>' +
      '<td class="mono numeric">' + fmtInt(Math.max(0, session.visibleOutputTokens ?? 0)) + '</td>' +
      '<td class="mono numeric">' + fmtInt(Math.max(0, session.finalReasoningOutputTokens ?? 0)) + '</td>' +
      '<td class="mono numeric">' + fmtInt(Math.max(0, session.adjustmentTokens ?? 0)) + '</td>' +
      '<td class="mono numeric">' + fmtInt(session.events) + '</td>' +
      '<td class="mono numeric">' + fmtInt(session.compactions) + '</td>' +
      '<td>' + esc(dominant) + '</td>' +
      '<td title="' + esc(likelyDriver) + '">' + esc(likelyDriver) + '</td>' +
      '<td class="command-preview" title="' + esc(topCommandPreview) + '">' + esc(topCommandPreview) + '</td>' +
    '</tr>';
  }).join('');

  rankingBody.innerHTML = cells || '<tr><td colspan="13" class="detail-empty">No session data.</td></tr>';
  getRows().forEach((row) => {
    row.addEventListener('mouseenter', () => {
      setHoveredSessionId(row.dataset.sessionId);
    });
    row.addEventListener('mouseleave', () => {
      if (state.selectedSessionId !== row.dataset.sessionId) {
        setHoveredSessionId(null);
      }
    });
    row.addEventListener('click', () => {
      setSelectedSessionId(row.dataset.sessionId);
      row.scrollIntoView({ block: 'nearest' });
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setSelectedSessionId(row.dataset.sessionId);
        row.scrollIntoView({ block: 'nearest' });
      }
    });
  });
  updateRowClasses();
};

const formatTickLabel = (timestamp) => {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  return month + '/' + day + ' ' + hour + ':00';
};

const buildTicks = (maxValue) => [0, 0.25, 0.5, 0.75, 1].map((fraction) => maxValue * fraction);

const drawAxes = (ctx, width, height, leftPad, rightPad, topPad, plotHeight, plotWidth, scrollLeft, maxTokens, maxEvents, domainStart, domainEnd, tickHours) => {
  const domainWidth = Math.max(1, domainEnd - domainStart);
  const tickMs = tickHours * 3_600_000;
  const firstTick = Math.ceil(domainStart / tickMs) * tickMs;
  const tokenTicks = buildTicks(maxTokens);
  const eventTicks = buildTicks(maxEvents);

  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  ctx.fillStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.font = '12px Inter, ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  tokenTicks.forEach((value, index) => {
    const fraction = index / (tokenTicks.length - 1);
    const y = topPad + plotHeight - fraction * plotHeight;
    ctx.beginPath();
    ctx.moveTo(leftPad, y);
    ctx.lineTo(width - rightPad, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(fmtCompact(value), leftPad - 10, y);
    ctx.textAlign = 'left';
    ctx.fillText(fmtCompact(eventTicks[index]), width - rightPad + 10, y);
  });

  ctx.save();
  ctx.translate(18, topPad + plotHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText('total tokens', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(width - 18, topPad + plotHeight / 2);
  ctx.rotate(Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText('events', 0, 0);
  ctx.restore();

  ctx.beginPath();
  for (let time = firstTick; time <= domainEnd; time += tickMs) {
    const x = leftPad + ((time - domainStart) / domainWidth) * plotWidth - scrollLeft;
    ctx.moveTo(x, topPad + plotHeight);
    ctx.lineTo(x, topPad + plotHeight + 6);
  }
  ctx.stroke();

  ctx.textAlign = 'center';
  for (let time = firstTick; time <= domainEnd; time += tickMs) {
    const x = leftPad + ((time - domainStart) / domainWidth) * plotWidth - scrollLeft;
    if (x < -60 || x > width + 60) {
      continue;
    }
    ctx.fillText(formatTickLabel(time), x, topPad + plotHeight + 18);
  }

  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('X: session start time', width / 2, height - 10);
  ctx.restore();
};

const renderChart = () => {
  if (!state.data) {
    return;
  }

  const sessions = state.data.sessions.filter((session) => session.startedAt !== null);
  const times = sessions.map((session) => parseTime(session.startedAt)).filter((value) => value !== null);
  const totals = sessions.map((session) => session.finalTotalTokens ?? 0);
  const maxTotal = Math.max(1, ...totals);
  const maxEvents = Math.max(1, ...state.data.sessions.map((session) => session.events));
  const start = times.length === 0 ? Date.now() : Math.min(...times);
  const end = times.length === 0 ? start + 3_600_000 : Math.max(...times);
  const marginMs = 3 * 3_600_000;
  const domainStart = start - marginMs;
  const domainEnd = end + marginMs;
  const durationHours = Math.max(1, (domainEnd - domainStart) / 3_600_000);
  const tickHours = state.pxPerHour <= 10 ? 24 : state.pxPerHour <= 16 ? 12 : state.pxPerHour <= 28 ? 6 : 3;
  const plotWidth = Math.max(960, Math.ceil(durationHours * state.pxPerHour) + 48);
  const leftPad = 72;
  const rightPad = 72;
  const topPad = 30;
  const plotHeight = 258;
  const bottomPad = 58;
  const chartHeight = topPad + plotHeight + bottomPad;
  const chartWidth = leftPad + plotWidth + rightPad;
  const viewportWidth = Math.floor(scrollArea.clientWidth);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  if (viewportWidth <= 0 || chartHeight <= 0) {
    return;
  }

  chartSpacer.style.width = chartWidth + 'px';
  chart.style.width = viewportWidth + 'px';
  chart.style.height = chartHeight + 'px';
  chart.width = Math.round(viewportWidth * dpr);
  chart.height = Math.round(chartHeight * dpr);

  const scrollLeft = Math.max(0, scrollArea.scrollLeft);
  const ctx = chart.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, viewportWidth, chartHeight);
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, viewportWidth, chartHeight);

  drawAxes(
    ctx,
    viewportWidth,
    chartHeight,
    leftPad,
    rightPad,
    topPad,
    plotHeight,
    plotWidth,
    scrollLeft,
    maxTotal,
    maxEvents,
    domainStart,
    domainEnd,
    tickHours,
  );

  const ordered = [...sessions].sort((a, b) => parseTime(a.startedAt) - parseTime(b.startedAt));
  const xFor = (session) => {
    const time = parseTime(session.startedAt);
    if (time === null) {
      return leftPad;
    }
    const ratio = domainEnd === domainStart ? 0 : (time - domainStart) / (domainEnd - domainStart);
    return leftPad + ratio * plotWidth;
  };
  const barWidth = Math.max(10, Math.min(22, plotWidth / Math.max(12, state.data.sessions.length * 2)));
  const hits = [];
  const visibleSessionIds = new Set();
  let leftmostVisibleSessionId = null;
  let leftmostVisibleX = Infinity;

  ctx.strokeStyle = 'rgba(255, 77, 141, 0.55)';
  ctx.fillStyle = '#ff4d8d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ordered.forEach((session, index) => {
    const x = xFor(session);
    const y = topPad + plotHeight - (session.events / maxEvents) * plotHeight;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ordered.forEach((session) => {
    const xAbsolute = xFor(session);
    const x = xAbsolute - scrollLeft;
    const total = session.finalTotalTokens ?? 0;
    const barHeight = (total / maxTotal) * plotHeight;
    const barTop = topPad + plotHeight - barHeight;
    let currentTop = barTop;
    let remaining = total;
    const segments = [
      ['non_cached_input', Math.max(0, session.nonCachedInputTokens ?? 0)],
      ['cached_input', Math.max(0, session.finalCachedInputTokens ?? 0)],
      ['visible_output', Math.max(0, session.visibleOutputTokens ?? 0)],
      ['reasoning_output', Math.max(0, session.finalReasoningOutputTokens ?? 0)],
      ['adjustment', Math.max(0, session.adjustmentTokens ?? 0)],
    ];

    if (x >= -40 && x <= viewportWidth + 40) {
      visibleSessionIds.add(session.sessionId);
      if (xAbsolute < leftmostVisibleX) {
        leftmostVisibleX = xAbsolute;
        leftmostVisibleSessionId = session.sessionId;
      }
    }

    for (const [segment, value] of segments) {
      const drawValue = Math.min(value, remaining);
      const segmentHeight = total === 0 ? 0 : (drawValue / maxTotal) * plotHeight;
      ctx.fillStyle = colorBySegment[segment];
      ctx.fillRect(x - barWidth / 2, currentTop, barWidth, segmentHeight);
      hits.push({
        type: 'segment',
        sessionId: session.sessionId,
        x: x - barWidth / 2,
        y: currentTop,
        width: barWidth,
        height: segmentHeight,
        text:
          'session: ' + session.sessionId +
          '\npath: ' + displayPath(session.path) +
          '\n' + labelBySegment[segment] + ': ' + fmtInt(drawValue) +
          '\ntotal tokens: ' + fmtInt(total),
      });
      currentTop += segmentHeight;
      remaining -= drawValue;
    }

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.strokeRect(x - barWidth / 2, barTop, barWidth, barHeight);
  });

  ordered.forEach((session) => {
    const xAbsolute = xFor(session);
    const x = xAbsolute - scrollLeft;
    const y = topPad + plotHeight - (session.events / maxEvents) * plotHeight;
    ctx.fillStyle = '#ff4d8d';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    hits.push({
      type: 'events',
      sessionId: session.sessionId,
      x: x - 6,
      y: y - 6,
      width: 12,
      height: 12,
      text:
        'session: ' + session.sessionId +
        '\npath: ' + displayPath(session.path) +
        '\nevents: ' + fmtInt(session.events),
    });
  });

  ordered.forEach((session) => {
    const xAbsolute = xFor(session);
    const x = xAbsolute - scrollLeft;
    const total = session.finalTotalTokens ?? 0;
    const barHeight = (total / maxTotal) * plotHeight;
    const compactionCount = session.compactions;
    if (compactionCount <= 0) {
      return;
    }
    for (let i = 0; i < compactionCount; i++) {
      const cy = Math.max(topPad + 16, topPad + plotHeight - barHeight - 12 - i * 8);
      ctx.fillStyle = '#b794f4';
      ctx.beginPath();
      ctx.arc(x, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    hits.push({
      type: 'compactions',
      sessionId: session.sessionId,
      x: x - 10,
      y: Math.max(topPad + 8, topPad + plotHeight - barHeight - 22 - (compactionCount - 1) * 8),
      width: 20,
      height: 24 + Math.max(0, compactionCount - 1) * 8,
      text:
        'session: ' + session.sessionId +
        '\npath: ' + displayPath(session.path) +
        '\ncompactions: ' + fmtInt(compactionCount),
    });
  });

  state.hoverHits = hits;
  state.visibleSessionIds = visibleSessionIds;
  state.leftmostVisibleSessionId = leftmostVisibleSessionId;
  updateRowClasses();
  scheduleRowScroll();
  ctx.restore();
};

const hitTest = (event) => {
  const rect = chart.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  return state.hoverHits.find((hit) => x >= hit.x && x <= hit.x + hit.width && y >= hit.y && y <= hit.y + hit.height) ?? null;
};

let pendingRenderFrame = null;

const safeRenderChart = () => {
  try {
    clearChartError();
    renderChart();
  } catch (error) {
    console.error(error);
    showChartError(error);
  }
};

const scheduleRenderChart = () => {
  if (pendingRenderFrame !== null) {
    return;
  }
  pendingRenderFrame = requestAnimationFrame(() => {
    pendingRenderFrame = null;
    safeRenderChart();
  });
};

chart.addEventListener('mousemove', (event) => {
  const hit = hitTest(event);
  if (!hit) {
    hideTooltip();
    setHoveredSessionId(null);
    return;
  }
  setHoveredSessionId(hit.sessionId);
  showTooltip(hit.text, event);
});

chart.addEventListener('mouseleave', () => {
  hideTooltip();
  setHoveredSessionId(null);
});

chart.addEventListener('click', (event) => {
  const hit = hitTest(event);
  if (!hit) {
    return;
  }
  window.location.href = '/?session=' + encodeURIComponent(hit.sessionId);
});

rankingBody.addEventListener('mouseleave', () => {
  if (state.selectedSessionId === null) {
    setHoveredSessionId(null);
  }
});

document.querySelectorAll('[data-tip].help').forEach((node) => {
  node.addEventListener('mouseenter', (event) => {
    showTooltip(node.dataset.tip, event);
  });
  node.addEventListener('mousemove', (event) => {
    showTooltip(node.dataset.tip, event);
  });
  node.addEventListener('mouseleave', hideTooltip);
});

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
};

loadOverview().catch((error) => {
  console.error(error);
  rankingBody.innerHTML = '<tr><td colspan="13" class="detail-empty">Failed to load overview: ' + esc(error.message) + '</td></tr>';
});
`;
