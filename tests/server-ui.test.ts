import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { overviewBodyMarkup } from "../src/server-ui/overview-markup.js";
import { escapeAttr, escapeHtml, help } from "../src/server-ui/shared.js";
import { singleSessionBodyMarkup } from "../src/server-ui/single-session-markup.js";

describe("server UI helpers", () => {
  it("escapes HTML text content", () => {
    expect(
      escapeHtml(`a "quoted" <tip>
<line>`),
    ).toBe('a "quoted" &lt;tip&gt;\n&lt;line&gt;');
  });

  it("escapes attribute content", () => {
    expect(escapeAttr(`a "quoted" <tip> 'value'`)).toBe(
      "a &quot;quoted&quot; &lt;tip&gt; &#39;value&#39;",
    );
  });

  it("renders help buttons with escaped labels", () => {
    expect(help(`Need "detail" <now>`)).toBe(
      '<button class="help" type="button" aria-label="Need &quot;detail&quot; &lt;now&gt;" data-tip="Need &quot;detail&quot; &lt;now&gt;">?</button>',
    );
  });

  it("renders overview body markup", () => {
    const html = overviewBodyMarkup();
    expect(html).toContain('<main class="page">');
    expect(html).toContain('id="ranking-body"');
    expect(html).toContain('id="chart"');
    expect(html).toContain('id="chart-error"');
    expect(html).not.toContain('id="detail"');
  });

  it("renders single-session body markup", () => {
    const html = singleSessionBodyMarkup();
    expect(html).toContain("<main>");
    expect(html).toContain('id="pressure"');
    expect(html).toContain('id="events"');
    expect(html).toContain('id="detail"');
  });

  it("keeps the single-session client module syntactically valid", () => {
    const result = spawnSync(
      "node",
      ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.browser.json", "--noEmit"],
      {
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
