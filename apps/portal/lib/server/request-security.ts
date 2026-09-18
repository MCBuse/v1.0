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
  return isTrustedPortalOrigin(
    request.headers.get("origin"),
    PORTAL_ORIGINS,
    process.env.NODE_ENV,
  );
}

export function hasValidCsrf(request: NextRequest) {
  const header = request.headers.get("x-csrf-token") ?? "";
  const cookie = request.cookies.get(CSRF_COOKIE)?.value ?? "";
  return Boolean(header && cookie && equal(header, cookie));
}

export function validateMutation(request: NextRequest, requireCsrf = true) {
  return hasTrustedOrigin(request) && (!requireCsrf || hasValidCsrf(request));
}
