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
  /^me\/products(?:\/[0-9a-f-]{36}(?:\/(?:image|stock-adjustments))?)?$/i,
  /^me\/invoices(?:\/[0-9a-f-]{36}(?:\/cancel)?)?$/i,
  /^me\/consents$/,
  /^me\/evidence-readiness$/,
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
    const { upstream, rotatedTokens } = await remoteRequest(
      `/merchants/${relative}${search}`,
      {
        method: request.method,
        body,
        headers: contentType ? { "Content-Type": contentType } : undefined,
      },
    );
    const payload = await upstream.text();
    const response = new NextResponse(payload || null, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, private",
      },
    });
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
