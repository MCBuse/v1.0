import { defineConfig } from "@playwright/test";
import { realEnv } from "./tests-real/real-env";

/**
 * Plan §9.5: the real API, the real portal and an isolated PostgreSQL. Nothing
 * is mocked; the Changes worker is run from the test through its CLI.
 *
 *   E2E_DATABASE_URL=postgres://postgres@localhost:55433/mcbuse_e2e \
 *     pnpm exec playwright test -c playwright.e2e-real.config.ts
 *
 * The database must be local and dedicated to this run: the API migrates it on
 * start. apps/api/.env is never read (NODE_ENV=test). Shares `.next` with the
 * mocked config, so do not run both at once.
 */
const env = realEnv();

export default defineConfig({
  testDir: "./tests-real",
  timeout: 180_000,
  workers: 1,
  use: {
    baseURL: env.portalOrigin,
    channel: "chrome",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  webServer: [
    {
      // Migrate the isolated database, build and start the real API.
      command:
        "pnpm exec drizzle-kit migrate --config drizzle.config.ts && pnpm build && node dist/src/main.js",
      cwd: "../api",
      url: `${env.apiUrl}/health`,
      timeout: 300_000,
      reuseExistingServer: false,
      env: env.api,
    },
    {
      command: `pnpm build && pnpm exec next start -H 127.0.0.1 -p ${env.portalPort}`,
      url: `${env.portalOrigin}/sign-in`,
      timeout: 300_000,
      reuseExistingServer: false,
      env: {
        MCBUSE_API_URL: env.apiUrl,
        PORTAL_ORIGIN: env.portalOrigin,
        SESSION_COOKIE_SECURE: "false",
      },
    },
  ],
});
