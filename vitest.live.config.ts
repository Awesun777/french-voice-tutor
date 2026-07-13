import { defineConfig } from "vitest/config";
import path from "path";

// Config for the LIVE tier only: tests that call real external APIs
// (DeepSeek, Gemini) and therefore need the production secrets. Run via
// `pnpm test:live`, which wraps this in `railway run` so Railway injects the
// keys into the process. Mirrors the root/resolve of vitest.config.ts but
// collects only *.live.test.ts.
const root = path.resolve(import.meta.dirname);

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": path.resolve(root, "client", "src"),
      "@shared": path.resolve(root, "shared"),
      "@assets": path.resolve(root, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.live.test.ts"],
  },
});
