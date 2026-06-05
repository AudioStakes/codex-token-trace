import { overviewCss } from "./assets.js";
import { overviewClientScript } from "./overview-client.js";
import { overviewBodyMarkup } from "./overview-markup.js";

export const overviewHtml = (): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Multi-session overview</title>
    <style>
${overviewCss()}
    </style>
  </head>
  <body>
${overviewBodyMarkup()}
    <script>
${overviewClientScript()}
    </script>
  </body>
</html>`;
