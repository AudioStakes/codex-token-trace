import { help } from "./shared.js";
import { overviewTooltips } from "./tooltips.js";

export const overviewBodyMarkup = (): string => `
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
    `;
