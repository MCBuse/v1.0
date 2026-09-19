import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/server/config";
import { hasTrustedOrigin } from "@/lib/server/request-security";
import { setSessionCookies } from "@/lib/server/session";

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
    const tokens = (await upstream.json().catch(() => null)) as {
      accessToken?: unknown;
      refreshToken?: unknown;
    } | null;
    if (
      !tokens ||
      typeof tokens.accessToken !== "string" ||
      typeof tokens.refreshToken !== "string"
    )
      return NextResponse.json(
        { message: "Sign-in is unavailable right now" },
        { status: 503 },
      );

    const membership = await fetch(`${API_URL}/merchants/me`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    });
    if (!membership.ok) {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens.accessToken}`,
        },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      }).catch(() => undefined);
      if (membership.status === 403 || membership.status === 404)
        return NextResponse.json(
          { message: "This account does not have merchant portal access" },
          { status: 403 },
        );
      return NextResponse.json(
        { message: "Sign-in is unavailable right now" },
        { status: 503 },
      );
    }

    const response = NextResponse.json({ ok: true });
    setSessionCookies(response, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    return response;
  } catch {
    return NextResponse.json(
      { message: "Sign-in is unavailable right now" },
      { status: 503 },
    );
  }
}
