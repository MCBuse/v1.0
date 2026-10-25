/** Environment shared by the real-stack config and spec. Refuses any non-local database. */
export function realEnv() {
  const databaseUrl = process.env.E2E_DATABASE_URL ?? "";
  const host = databaseUrl ? new URL(databaseUrl).hostname : "";
  if (!["localhost", "127.0.0.1", "::1"].includes(host))
    throw new Error("Set E2E_DATABASE_URL to a dedicated local PostgreSQL database (it is migrated and written to).");
  const apiPort = process.env.E2E_API_PORT ?? "4111";
  const portalPort = process.env.E2E_PORTAL_PORT ?? "3111";
  // Same flags for the API and the worker (runbook §2): the feature check is shared.
  const feature = {
    NODE_ENV: "test" as const, // the API and worker then ignore apps/api/.env
    DATABASE_URL: databaseUrl,
    DATABASE_SSL: "disable",
    MERCHANT_CHANGE_INTELLIGENCE_ENABLED: "true",
    MERCHANT_CHANGE_INTELLIGENCE_ALLOWLIST: "", // every active merchant of this isolated database
  };
  return {
    databaseUrl,
    apiUrl: `http://127.0.0.1:${apiPort}/api/v1`,
    portalPort,
    portalOrigin: `http://127.0.0.1:${portalPort}`,
    worker: feature,
    api: {
      ...feature,
      PORT: apiPort,
      HOST: "127.0.0.1",
      API_PREFIX: "api/v1",
      JWT_ACCESS_SECRET: process.env.E2E_JWT_ACCESS_SECRET ?? "e2e-real-access-secret-0123456789abcdef",
      JWT_REFRESH_SECRET: process.env.E2E_JWT_REFRESH_SECRET ?? "e2e-real-refresh-secret-0123456789abcdef",
      // Test-only key for wallets created in the isolated database.
      SOLANA_KEYPAIR_ENCRYPTION_KEY: "5f1c0e7a9b3d48c6a2e4f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b",
      // Required at boot; never contacted by this path.
      MOONPAY_SECRET_KEY: "unused",
      PRIVY_APP_ID: "unused",
      SOLANA_RPC_URL: "http://127.0.0.1:1",
      SOLANA_USDC_MINT: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      STRIPE_SECRET_KEY: "sk_test_unused",
      MERCHANT_PORTAL_ENABLED: "true",
      MERCHANT_GENERAL_ANALYTICS_ENABLED: "true",
      THROTTLE_LIMIT: "100000",
      THROTTLE_TTL: "60000",
    },
  };
}
