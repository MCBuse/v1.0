import "server-only";

import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_URL, COOKIE_SECURE } from "./config";

export const ACCESS_COOKIE = "mcbuse_portal_access";
export const REFRESH_COOKIE = "mcbuse_portal_refresh";
export const WORKSPACE_COOKIE = "mcbuse_portal_workspace";
export const CSRF_COOKIE = "mcbuse_portal_csrf";

export type MerchantSessionState =
  | "anonymous"
  | "valid"
  | "refresh"
  | "rejected"
  | "unavailable";

const baseCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: COOKIE_SECURE,
  path: "/",
};

export function setSessionCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
  csrfToken?: string,
) {
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookie,
    maxAge: 15 * 60,
  });
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookie,
    maxAge: 7 * 24 * 60 * 60,
  });
  setCsrfCookie(response, csrfToken);
}

export function setCsrfCookie(response: NextResponse, token?: string) {
  response.cookies.set(CSRF_COOKIE, token || randomUUID(), {
    ...baseCookie,
    httpOnly: false,
    maxAge: 7 * 24 * 60 * 60,
  });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(WORKSPACE_COOKIE, "", { ...baseCookie, maxAge: 0 });
  response.cookies.set(ACCESS_COOKIE, "", { ...baseCookie, maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { ...baseCookie, maxAge: 0 });
  response.cookies.set(CSRF_COOKIE, "", {
    ...baseCookie,
    httpOnly: false,
    maxAge: 0,
  });
}

export async function getMerchantSessionState(resource: "/merchants/me" | "/staff/me" = "/merchants/me"): Promise<MerchantSessionState> {
  const jar = await cookies();
  const accessToken = jar.get(ACCESS_COOKIE)?.value;
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (!accessToken && !refreshToken) return "anonymous";
  if (!accessToken) return "refresh";

  try {
    const upstream = await fetch(`${API_URL}${resource}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (upstream.ok) return "valid";
    if (upstream.status === 401) return refreshToken ? "refresh" : "rejected";
    if (upstream.status === 403 || upstream.status === 404) return "rejected";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

export interface RemoteRequestOptions {
  /**
   * A long-lived response body, such as server-sent events. The request
   * timeout is dropped, because the point of the connection is to stay open,
   * and the caller is expected to pipe the body rather than read it.
   */
  stream?: boolean;
  /** Ties the upstream request to the client's connection. */
  signal?: AbortSignal;
}

export async function remoteRequest(
  path: string,
  init: RequestInit = {},
  options: RemoteRequestOptions = {},
) {
  const jar = await cookies();
  let accessToken = jar.get(ACCESS_COOKIE)?.value;
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  const request = (token?: string) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      cache: "no-store",
      signal: options.stream
        ? options.signal
        : (options.signal ?? AbortSignal.timeout(12_000)),
      headers: {
        Accept: options.stream ? "text/event-stream" : "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.body && !new Headers(init.headers).has("Content-Type")
          ? { "Content-Type": "application/json" }
          : {}),
        ...init.headers,
      },
    });

  let upstream = await request(accessToken);
  let rotatedTokens: { accessToken: string; refreshToken: string } | null =
    null;
  if (upstream.status === 401 && refreshToken) {
    const refresh = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });
    if (refresh.ok) {
      rotatedTokens = (await refresh.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      accessToken = rotatedTokens.accessToken;
      upstream = await request(accessToken);
    }
  }
  return { upstream, rotatedTokens };
}
