import { NextRequest, NextResponse } from "next/server";
import { validateMutation } from "@/lib/server/request-security";
import { isAllowedStaffPath } from "@/lib/server/staff-proxy-allowlist";
import {
  clearSessionCookies,
  CSRF_COOKIE,
  remoteRequest,
  setCsrfCookie,
  setSessionCookies,
} from "@/lib/server/session";
async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  if (!isAllowedStaffPath(path))
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  if (request.method !== "GET" && !validateMutation(request))
    return NextResponse.json(
      { message: "Request could not be verified" },
      { status: 403 },
    );
  try {
    const key = request.headers.get("idempotency-key");
    const { upstream, rotatedTokens } = await remoteRequest(
      `/staff/${path}${request.nextUrl.search}`,
      {
        method: request.method,
        ...(request.method === "POST" ? { body: await request.text() } : {}),
        headers: { ...(key ? { "Idempotency-Key": key } : {}) },
      },
    );
    const response = new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, private",
      },
    });
    const csrf = request.cookies.get(CSRF_COOKIE)?.value;
    if (rotatedTokens) setSessionCookies(response, rotatedTokens, csrf);
    else if (upstream.ok && !csrf) setCsrfCookie(response);
    if (upstream.status === 401) clearSessionCookies(response);
    return response;
  } catch {
    return NextResponse.json(
      { message: "The staff service is temporarily unavailable" },
      { status: 503 },
    );
  }
}
export const GET = forward;
export const POST = forward;
