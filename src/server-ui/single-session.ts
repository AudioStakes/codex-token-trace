import { singleSessionCss } from "./assets.js";
import { singleSessionBodyMarkup } from "./single-session-markup.js";
import { indentLines } from "./shared.js";

export const singleSessionHtml = (): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>codex-token-trace session timeline explorer</title>
    <style>
${indentLines(singleSessionCss(), 6)}
    </style>
  </head>
  <body>
${indentLines(singleSessionBodyMarkup(), 4)}
    <script type="module" src="/assets/single-session-client.js"></script>
  </body>
</html>`;
