import { help } from "./shared.js";
import { overviewTooltips } from "./tooltips.js";

export const overviewBodyMarkup = (): string => `
<main class="page">
  <header class="page-header">
    <div class="headline">
      <p class="eyebrow">Codex token trace</p>
      <h1>Multi-session overview</h1>
      <p class="lede">Compare sessions by token mix, event count, and compaction pressure.</p>
    </div>
    <div class="summary" aria-label="Overview summary">
      <article class="card">
        <div class="label">sessions ${help(overviewTooltips.sessions)}</div>
        <div class="value" id="summary-sessions">0</div>
      </article>
      <article class="card">
        <div class="label">total tokens ${help(overviewTooltips.totalTokens)}</div>
        <div class="value" id="summary-tokens">0</div>
      </article>
      <article class="card">
        <div class="label">median/session</div>
        <div class="value" id="summary-median">0</div>
      </article>
      <article class="card">
        <div class="label">max events</div>
        <div class="value" id="summary-events">0</div>
      </article>
      <article class="card">
        <div class="label">sessions with compaction ${help(overviewTooltips.sessionsWithCompaction)}</div>
        <div class="value" id="summary-compactions">0</div>
      </article>
    </div>
  </header>

  <section class="panel chart-panel" aria-label="Chart overview">
    <div class="chart-shell">
      <div class="chart-scroll" id="chart-scroll">
        <canvas id="chart" class="chart" aria-label="Multi-session chart"></canvas>
        <div id="chart-spacer" class="chart-spacer" aria-hidden="true"></div>
      </div>
      <div class="chart-footer">
        <div class="legend" aria-label="Chart legend">
          <span class="legend-item"><span class="swatch swatch-input"></span>non-cached input ${help(overviewTooltips.nonCachedInput)}</span>
          <span class="legend-item"><span class="swatch swatch-cached"></span>cached input ${help(overviewTooltips.cachedInput)}</span>
          <span class="legend-item"><span class="swatch swatch-visible"></span>visible output ${help(overviewTooltips.visibleOutput)}</span>
          <span class="legend-item"><span class="swatch swatch-reasoning"></span>reasoning output ${help(overviewTooltips.reasoningOutput)}</span>
          <span class="legend-item"><span class="swatch swatch-adjust"></span>adjustment ${help(overviewTooltips.adjustment)}</span>
          <span class="legend-item"><span class="swatch swatch-events"></span>events ${help(overviewTooltips.events)}</span>
          <span class="legend-item"><span class="swatch swatch-compactions"></span>compactions ${help(overviewTooltips.compactions)}</span>
        </div>
        <label class="scale" for="scale">
          <span>time scale</span>
          <output id="scale-value">24 px/hour</output>
          <input id="scale" type="range" min="8" max="56" step="2" value="24" />
        </label>
      </div>
    </div>
  </section>

  <section class="grid" aria-label="Session ranking">
    <div class="table-shell panel">
      <table>
        <colgroup>
          <col class="col-time" />
          <col class="col-session" />
          <col class="col-num" />
          <col class="col-num" />
          <col class="col-num" />
          <col class="col-num" />
          <col class="col-num" />
          <col class="col-num" />
          <col class="col-num" />
          <col class="col-num" />
          <col class="col-dominant" />
          <col class="col-driver" />
          <col class="col-command" />
        </colgroup>
        <thead>
          <tr>
            <th>time</th>
            <th>session</th>
            <th>total tokens</th>
            <th>non-cached input</th>
            <th>cached input</th>
            <th>visible output</th>
            <th>reasoning output</th>
            <th>adjustment</th>
            <th>events</th>
            <th>compactions</th>
            <th>dominant</th>
            <th>likely driver</th>
            <th>top command preview</th>
          </tr>
        </thead>
        <tbody id="ranking-body"></tbody>
      </table>
    </div>
  </section>
</main>
<div id="tooltip" class="tooltip" hidden></div>
`;
