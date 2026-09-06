import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { API_URL, COOKIE_SECURE } from "@/lib/server/config";
import { hasTrustedOrigin } from "@/lib/server/request-security";
import { CSRF_COOKIE, setSessionCookies } from "@/lib/server/session";

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { message: "Request origin is not allowed" },
      { status: 403 },
    );
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
  } | null;
  if (
    !body ||
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    body.email.length > 255 ||
    body.password.length > 200
  ) {
    return NextResponse.json(
      { message: "Enter a valid email and password" },
      { status: 400 },
    );
  }
  try {
    const upstream = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        password: body.password,
      }),
    });
    if (!upstream.ok)
      return NextResponse.json(
        {
          message:
            upstream.status === 401
              ? "Email or password is incorrect"
              : "Sign-in is unavailable right now",
        },
        { status: upstream.status === 401 ? 401 : 503 },
      );
    const tokens = (await upstream.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    const response = NextResponse.json({ ok: true });
    setSessionCookies(response, tokens);
    response.cookies.set(CSRF_COOKIE, randomUUID(), {
      httpOnly: false,
      sameSite: "lax",
      secure: COOKIE_SECURE,
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    return response;
  } catch {
    return NextResponse.json(
      { message: "Sign-in is unavailable right now" },
      { status: 503 },
    );
  }
}
