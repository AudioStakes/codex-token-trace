import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { overviewBodyMarkup } from "../src/server-ui/overview-markup.js";
import { escapeAttr, escapeHtml, help } from "../src/server-ui/shared.js";
import { singleSessionClientScript } from "../src/server-ui/single-session-client.js";
import { singleSessionBodyMarkup } from "../src/server-ui/single-session-markup.js";

describe("server UI helpers", () => {
  it("escapes HTML text content", () => {
    expect(escapeHtml(`a "quoted" <tip> & more`)).toBe(`a "quoted" &lt;tip&gt; &amp; more`);
  });

  it("escapes HTML attributes", () => {
    expect(escapeAttr(`a "quoted" <tip> 'x'`)).toBe(`a &quot;quoted&quot; &lt;tip&gt; &#39;x&#39;`);
  });

  it("renders help buttons", () => {
    const html = help("copy");
    expect(html).toContain('class="help"');
    expect(html).toContain('aria-label="copy"');
    expect(html).toContain('data-tip="copy"');
  });

  it("renders overview body markup", () => {
    const html = overviewBodyMarkup();
    expect(html).toContain('id="chart-spacer"');
    expect(html).toContain('type="range"');
    expect(html).toContain("X: session start time");
    expect(html).toContain("legend");
  });

  it("renders single-session body markup", () => {
    const html = singleSessionBodyMarkup();
    expect(html).toContain("<main>");
    expect(html).toContain('id="pressure"');
    expect(html).toContain("data-tip=");
    expect(html).toContain("Session timeline");
  });

  it("keeps the single-session client script syntactically valid", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctt-single-session-"));
    const scriptPath = join(dir, "single-session-client.mjs");
    writeFileSync(scriptPath, `${singleSessionClientScript()}\n`);

    const result = spawnSync("node", ["--check", scriptPath], {
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
