import "server-only";

import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { CSRF_COOKIE } from "./session";
import { PORTAL_ORIGINS } from "./config";
import { isTrustedPortalOrigin } from "./trusted-origin";

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hasTrustedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const trusted = isTrustedPortalOrigin(
    origin,
    PORTAL_ORIGINS,
    process.env.NODE_ENV,
  );
  if (!trusted)
    // Surfaces misconfigured PORTAL_ORIGIN/PORTAL_ORIGINS in Cloud Run logs.
    console.warn(
      JSON.stringify({
        message: "Rejected request from untrusted origin",
        origin,
        path: request.nextUrl.pathname,
        trustedOrigins: PORTAL_ORIGINS,
      }),
    );
  return trusted;
}

export function hasValidCsrf(request: NextRequest) {
  const header = request.headers.get("x-csrf-token") ?? "";
  const cookie = request.cookies.get(CSRF_COOKIE)?.value ?? "";
  return Boolean(header && cookie && equal(header, cookie));
}

export function validateMutation(request: NextRequest, requireCsrf = true) {
  return hasTrustedOrigin(request) && (!requireCsrf || hasValidCsrf(request));
}
