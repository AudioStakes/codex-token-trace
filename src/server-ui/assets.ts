import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

export const readServerUiAsset = (filename: string): string =>
  readFileSync(join(currentDir, filename), "utf8");

export const singleSessionCss = (): string => readServerUiAsset("single-session.css");

export const overviewCss = (): string => readServerUiAsset("overview.css");
