import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const readBrowserClientAsset = (filename: string): string => {
  const assetPath = join(process.cwd(), "dist", "server-ui", filename);

  if (!existsSync(assetPath)) {
    throw new Error(`${filename} is missing. Run npm run build.`);
  }

  return readFileSync(assetPath, "utf8");
};

export const overviewClientJs = (): string => readBrowserClientAsset("overview-client.js");

export const singleSessionClientJs = (): string =>
  readBrowserClientAsset("single-session-client.js");
