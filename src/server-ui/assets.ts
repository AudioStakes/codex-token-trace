import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

export const readServerUiAsset = (filename: string): string => {
  const candidates = [
    join(currentDir, filename),
    join(process.cwd(), "dist", "src", "server-ui", filename),
    join(process.cwd(), "dist", "server-ui", filename),
    join(process.cwd(), "src", "server-ui", filename),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf8");
    }
  }

  throw new Error(`Server UI asset not found: ${filename}`);
};

export const singleSessionCss = (): string => readServerUiAsset("single-session.css");
export const overviewCss = (): string => readServerUiAsset("overview.css");
export const overviewClientJs = (): string => readServerUiAsset("overview-client.js");
