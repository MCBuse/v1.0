import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/server/config";
import { validateMutation } from "@/lib/server/request-security";
import {
  ACCESS_COOKIE,
  clearSessionCookies,
  REFRESH_COOKIE,
} from "@/lib/server/session";

export async function POST(request: NextRequest) {
  if (!validateMutation(request))
    return NextResponse.json(
      { message: "Request could not be verified" },
      { status: 403 },
    );
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (access && refresh) {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken: refresh }),
    }).catch(() => null);
  }
  const response = new NextResponse(null, { status: 204 });
  clearSessionCookies(response);
  return response;
}
