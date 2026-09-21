import { NextRequest, NextResponse } from "next/server";
import { validateMutation } from "@/lib/server/request-security";
import {
  clearSessionCookies,
  CSRF_COOKIE,
  remoteRequest,
  setCsrfCookie,
  setSessionCookies,
} from "@/lib/server/session";

const allowed = [
  /^me$/,
  /^me\/summary$/,
  /^me\/transactions$/,
  /^me\/payment-requests$/,
  /^me\/payment-requests\/[0-9a-f-]{36}$/i,
  /^me\/payment-requests\/[0-9a-f-]{36}\/present$/i,
  /^me\/presented-request$/,
  /^me\/events$/,
  /^me\/events\/stream$/,
  /^me\/products(?:\/[0-9a-f-]{36}(?:\/(?:image|stock-adjustments|analytics))?)?$/i,
  /^me\/invoices(?:\/[0-9a-f-]{36}(?:\/cancel)?)?$/i,
  /^me\/consents$/,
  /^me\/evidence-readiness$/,
  /^me\/credit-assessment$/,
  /^me\/activity$/,
  /^me\/analytics$/,
  /^me\/cash-sales(?:\/[0-9a-f-]{36}\/(?:void|attachment))?$/i,
  /^me\/imports\/preview$/,
  /^me\/imports\/(?:inventory|settlement)\/preview$/,
  /^me\/imports$/,
  /^me\/imports\/[0-9a-f-]{36}\/mapping$/i,
  /^me\/imports\/[0-9a-f-]{36}\/commit$/i,
  /^me\/reconciliation$/,
  /^me\/finance-packages$/,
  /^me\/finance-packages\/[0-9a-f-]{36}(?:\/(?:pdf|data|email))?$/i,
];

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const segments = (await context.params).path;
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
    request.method === "GET" || request.method === "DELETE"
      ? undefined
      : contentType?.startsWith("multipart/form-data")
        ? await request.arrayBuffer()
        : await request.text();
  // Server-sent events must be piped, never buffered: reading the body to
  // completion would hold the response open forever and deliver nothing.
  if (relative === "me/events/stream") return forwardStream(request, relative);

  try {
    const idempotencyKey = request.headers.get("idempotency-key");
    const { upstream, rotatedTokens } = await remoteRequest(
      `/merchants/${relative}${search}`,
      {
        method: request.method,
        body,
        headers: {
          ...(contentType ? { "Content-Type": contentType } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
      },
    );
    const contentTypeOut = upstream.headers.get("content-type") ?? "application/json";
    const payload = contentTypeOut.includes("application/json")
      ? await upstream.text()
      : await upstream.arrayBuffer();
    const response = new NextResponse(payload || null, {
      status: upstream.status,
      headers: {
        "Content-Type": contentTypeOut,
        "Cache-Control": "no-store, private",
      },
    });
    const disposition = upstream.headers.get("content-disposition");
    if (disposition) response.headers.set("Content-Disposition", disposition);
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

/**
 * Pipes an upstream event stream straight through to the browser.
 *
 * The client's abort signal is passed upstream, so closing the tab closes the
 * API connection too rather than leaving it dangling.
 */
async function forwardStream(request: NextRequest, relative: string) {
  const search = request.nextUrl.search;
  const lastEventId = request.headers.get("last-event-id");
  try {
    const { upstream } = await remoteRequest(
      `/merchants/${relative}${search}`,
      {
        method: "GET",
        headers: lastEventId ? { "Last-Event-ID": lastEventId } : {},
      },
      { stream: true, signal: request.signal },
    );

    if (!upstream.ok || !upstream.body) {
      const response = NextResponse.json(
        { message: "The event stream is unavailable" },
        { status: upstream.status === 401 ? 401 : 503 },
      );
      if (upstream.status === 401) clearSessionCookies(response);
      return response;
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform, private",
        Connection: "keep-alive",
        // Tells nginx and Cloud Run's proxy not to buffer the response.
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "The event stream is unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
