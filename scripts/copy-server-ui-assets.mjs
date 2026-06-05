import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(repoRoot, "src", "server-ui");
const distDir = join(repoRoot, "dist", "server-ui");

mkdirSync(distDir, { recursive: true });

for (const filename of ["single-session.css", "overview.css"]) {
  copyFileSync(join(srcDir, filename), join(distDir, filename));
}
