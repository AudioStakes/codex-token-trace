import { overviewCss } from "./assets.js";
import { overviewBodyMarkup } from "./overview-markup.js";
import { indentLines } from "./shared.js";

export const overviewHtml = (): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Multi-session overview</title>
  <style>
${indentLines(overviewCss(), 6)}
  </style>
</head>
<body>
${indentLines(overviewBodyMarkup(), 4)}
  <script type="module" src="/assets/overview-client.js"></script>
</body>
</html>`;
