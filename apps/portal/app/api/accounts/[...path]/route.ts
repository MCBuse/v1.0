import { NextRequest, NextResponse } from "next/server";
import { validateMutation } from "@/lib/server/request-security";
import {
  clearSessionCookies,
  CSRF_COOKIE,
  remoteRequest,
  setCsrfCookie,
  setSessionCookies,
} from "@/lib/server/session";

/**
 * The account endpoints are not under `/merchants`, so they need their own
 * proxy. The allowlist is explicit for the same reason the merchant one is:
 * anything not named here is not reachable from a browser session.
 */
const allowed = [
  /^$/,
  /^payout-destinations$/,
  /^funding$/,
  /^transfers$/,
  /^withdrawals$/,
  /^day-end$/,
  /^operations$/,
  /^operations\/[0-9a-f-]{36}$/i,
];

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const segments = (await context.params).path ?? [];
  const relative = segments.join("/");
  if (!allowed.some((pattern) => pattern.test(relative)))
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  if (request.method !== "GET" && !validateMutation(request))
    return NextResponse.json(
      { message: "Request could not be verified" },
      { status: 403 },
    );

  const search = request.nextUrl.search;
  const contentType = request.headers.get("content-type") ?? undefined;
  const body =
    request.method === "GET" ? undefined : await request.text();

  try {
    const idempotencyKey = request.headers.get("idempotency-key");
    const { upstream, rotatedTokens } = await remoteRequest(
      `/accounts${relative ? `/${relative}` : ""}${search}`,
      {
        method: request.method,
        body,
        headers: {
          ...(contentType ? { "Content-Type": contentType } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
      },
    );
    const payload = await upstream.text();
    const response = new NextResponse(payload || null, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store, private",
      },
    });
    const csrfToken = request.cookies.get(CSRF_COOKIE)?.value;
    if (rotatedTokens) setSessionCookies(response, rotatedTokens, csrfToken);
    else if (upstream.ok && request.method === "GET" && !csrfToken)
      setCsrfCookie(response);
    if (upstream.status === 401) clearSessionCookies(response);
    return response;
  } catch {
    return NextResponse.json(
      { message: "The payment service is temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = forward;
export const POST = forward;
