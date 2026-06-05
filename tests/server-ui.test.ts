import { describe, expect, it } from "vitest";

import { escapeAttr, escapeHtml, help } from "../src/server-ui/shared.js";

describe("server UI helpers", () => {
  it("escapes HTML text content", () => {
    expect(escapeHtml(`a "quoted" <tip> & more`)).toBe(`a "quoted" &lt;tip&gt; &amp; more`);
  });

  it("escapes HTML attributes", () => {
    expect(escapeAttr(`a "quoted" <tip> 'x'`)).toBe(`a &quot;quoted&quot; &lt;tip&gt; &#39;x&#39;`);
  });

  it("escapes help tooltip attributes", () => {
    const html = help(`a "quoted" <tip> 'x'`);
    expect(html).toContain(`aria-label="a &quot;quoted&quot; &lt;tip&gt; &#39;x&#39;"`);
    expect(html).toContain(`data-tip="a &quot;quoted&quot; &lt;tip&gt; &#39;x&#39;"`);
    expect(html).not.toContain(`<tip>`);
    expect(html).not.toContain(`"quoted"`);
  });
});
