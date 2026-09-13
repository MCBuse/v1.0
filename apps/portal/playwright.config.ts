import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:3101",
    channel: "chrome",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "node tests/mock-api.mjs",
      url: "http://127.0.0.1:4011/api/v1/health",
      reuseExistingServer: false,
    },
    {
      command: "pnpm build && pnpm exec next start -H 127.0.0.1 -p 3101",
      url: "http://127.0.0.1:3101/sign-in",
      reuseExistingServer: false,
      env: {
        MCBUSE_API_URL: "http://127.0.0.1:4011/api/v1",
        PORTAL_ORIGIN: "http://127.0.0.1:3101",
        SESSION_COOKIE_SECURE: "false",
      },
    },
  ],
  projects: [
    {
      name: "mobile",
      use: {
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
  ],
});
