import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const scriptPolicy =
  process.env.NODE_ENV === "production"
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value:
      `default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; ${scriptPolicy}; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  outputFileTracingRoot: root,
  transpilePackages: ["@repo/ui", "@repo/shared"],
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        // The immutable PDF is embedded by Finance Match on this same origin.
        // All other pages continue to reject framing entirely.
        source: "/api/merchant/me/finance-packages/:id/pdf",
        headers: securityHeaders.map((header) =>
          header.key === "X-Frame-Options"
            ? { ...header, value: "SAMEORIGIN" }
            : header.key === "Content-Security-Policy"
              ? { ...header, value: header.value.replace("frame-ancestors 'none'", "frame-ancestors 'self'") }
              : header,
        ),
      },
    ];
  },
};

export default nextConfig;
