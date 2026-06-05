import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const overviewClientJs = (): string => {
  const assetPath = join(process.cwd(), "dist", "server-ui", "overview-client.js");

  if (!existsSync(assetPath)) {
    throw new Error("overview-client.js is missing. Run npm run build.");
  }

  return readFileSync(assetPath, "utf8");
};
