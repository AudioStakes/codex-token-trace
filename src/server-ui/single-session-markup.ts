import { help } from "./shared.js";
import { singleSessionTooltips } from "./tooltips.js";

export const singleSessionBodyMarkup = (): string =>
  String.raw`
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

`.trim();
