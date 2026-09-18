import "server-only";

export const API_URL = (
  process.env.MCBUSE_API_URL ??
  "https://mcbuse-api-332810840225.europe-west1.run.app/api/v1"
).replace(/\/$/, "");
export const PORTAL_ORIGIN = (
  process.env.PORTAL_ORIGIN ?? "http://localhost:3001"
).replace(/\/$/, "");
export const PORTAL_ORIGINS = Array.from(
  new Set(
    [
      PORTAL_ORIGIN,
      ...(process.env.PORTAL_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim().replace(/\/$/, ""))
        .filter(Boolean),
    ],
  ),
);
export function isConfiguredPortalOrigin(origin: string) {
  return PORTAL_ORIGINS.includes(origin);
}
const portalHostname = new URL(PORTAL_ORIGIN).hostname;
const portalIsLocal =
  portalHostname === "localhost" || portalHostname === "127.0.0.1";
export const COOKIE_SECURE =
  process.env.SESSION_COOKIE_SECURE === "true" ||
  (process.env.SESSION_COOKIE_SECURE !== "false" && !portalIsLocal);
