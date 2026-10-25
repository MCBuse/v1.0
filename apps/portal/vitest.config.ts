import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "jsdom", include: ["**/*.test.ts", "**/*.test.tsx"] },
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
