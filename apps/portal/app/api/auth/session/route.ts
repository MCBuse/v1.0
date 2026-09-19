import { NextRequest, NextResponse } from "next/server";
import {
  isConfiguredPortalOrigin,
  PORTAL_ORIGIN,
} from "@/lib/server/config";
import {
  clearSessionCookies,
  CSRF_COOKIE,
  remoteRequest,
  setCsrfCookie,
  setSessionCookies,
} from "@/lib/server/session";

const destinations = new Set([
  "/overview",
  "/transactions",
  "/business-profile",
]);

function safeDestination(value: string | null) {
  return value && destinations.has(value) ? value : "/overview";
}

export async function GET(request: NextRequest) {
  const destination = safeDestination(request.nextUrl.searchParams.get("next"));
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",", 1)[0];
  const requestOrigin = request.headers.get("host")
    ? `${forwardedProtocol ?? request.nextUrl.protocol.replace(":", "")}://${request.headers.get("host")}`
    : request.nextUrl.origin;
  const responseOrigin = isConfiguredPortalOrigin(requestOrigin)
    ? requestOrigin
    : PORTAL_ORIGIN;
  try {
    const { upstream, rotatedTokens } = await remoteRequest("/merchants/me");
    if (upstream.ok) {
      const response = NextResponse.redirect(
        new URL(destination, responseOrigin),
      );
      const csrfToken = request.cookies.get(CSRF_COOKIE)?.value;
      if (rotatedTokens) setSessionCookies(response, rotatedTokens, csrfToken);
      else if (!csrfToken) setCsrfCookie(response);
      return response;
    }
  } catch {
    // A session that cannot be verified must not grant access to merchant pages.
  }

  const response = NextResponse.redirect(new URL("/sign-in", responseOrigin));
  clearSessionCookies(response);
  return response;
}
