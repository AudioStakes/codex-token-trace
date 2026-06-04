import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: false,
    coverage: {
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
});
