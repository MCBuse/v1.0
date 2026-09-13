import { NextRequest, NextResponse } from "next/server";
import { PORTAL_ORIGIN } from "@/lib/server/config";
import {
  clearSessionCookies,
  remoteRequest,
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
  try {
    const { upstream, rotatedTokens } = await remoteRequest("/merchants/me");
    if (upstream.ok) {
      const response = NextResponse.redirect(
        new URL(destination, PORTAL_ORIGIN),
      );
      if (rotatedTokens) setSessionCookies(response, rotatedTokens);
      return response;
    }
  } catch {
    // A session that cannot be verified must not grant access to merchant pages.
  }

  const response = NextResponse.redirect(new URL("/sign-in", PORTAL_ORIGIN));
  clearSessionCookies(response);
  return response;
}
