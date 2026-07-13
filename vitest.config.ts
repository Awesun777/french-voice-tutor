import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    // Live-API tests (*.live.test.ts) hit real DeepSeek/Gemini endpoints and
    // need Railway secrets. Excluded from the default run so `pnpm test` is
    // always green locally; run them via `pnpm test:live` (railway run).
    exclude: [...configDefaults.exclude, "**/*.live.test.ts"],
  },
});
