import { NextRequest, NextResponse } from "next/server";
import { validateMutation } from "@/lib/server/request-security";
import {
  clearSessionCookies,
  remoteRequest,
  setSessionCookies,
} from "@/lib/server/session";

const allowed = [
  /^me$/,
  /^me\/summary$/,
  /^me\/transactions$/,
  /^me\/payment-requests$/,
  /^me\/payment-requests\/[0-9a-f-]{36}$/i,
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
    if (rotatedTokens) setSessionCookies(response, rotatedTokens);
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
export const PATCH = forward;
export const DELETE = forward;
