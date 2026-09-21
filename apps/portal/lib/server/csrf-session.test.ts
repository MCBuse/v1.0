// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const state = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = state.jar.get(name);
      return value === undefined ? undefined : { value };
    },
  }),
}));
vi.mock("./config", () => ({
  API_URL: "https://api.example.test/api/v1",
  PORTAL_ORIGIN: "https://merchant.example.test",
  PORTAL_ORIGINS: ["https://merchant.example.test"],
  COOKIE_SECURE: true,
  isConfiguredPortalOrigin: (origin: string) => origin === "https://merchant.example.test",
}));

import { CSRF_COOKIE, setSessionCookies } from "./session";
import { GET, POST } from "@/app/api/merchant/[...path]/route";
import { GET as accountSummary } from "@/app/api/accounts/route";
import { GET as renewSession } from "@/app/api/auth/session/route";

const url = "https://merchant.example.test/api/merchant/me/invoices";
const context = { params: Promise.resolve({ path: ["me", "invoices"] }) };

beforeEach(() => {
  state.jar.clear();
  state.jar.set("mcbuse_portal_access", "valid-access");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"id":"merchant"}', {
    status: 200, headers: { "Content-Type": "application/json" },
  })));
});

describe("CSRF continuity for authenticated merchant sessions", () => {
  it("issues a CSRF cookie with renewed authentication cookies", () => {
    const response = NextResponse.json({ ok: true });
    setSessionCookies(response, { accessToken: "new-access", refreshToken: "new-refresh" });
    expect(response.cookies.get(CSRF_COOKIE)).toMatchObject({
      value: expect.any(String), httpOnly: false, secure: true, sameSite: "lax", path: "/", maxAge: 604800,
    });
    expect(response.cookies.get(CSRF_COOKIE)?.value).not.toBe("");
  });

  it("repairs a missing CSRF cookie after an authenticated merchant GET", async () => {
    const response = await GET(new NextRequest(url), context);
    expect(response.status).toBe(200);
    expect(response.cookies.get(CSRF_COOKIE)?.value).toBeTruthy();
  });

  it("preserves the existing CSRF value when authentication cookies rotate", () => {
    const response = NextResponse.json({ ok: true });
    setSessionCookies(response, { accessToken: "new-access", refreshToken: "new-refresh" }, "existing-token");
    expect(response.cookies.get(CSRF_COOKIE)?.value).toBe("existing-token");
  });

  it("does not issue a usable CSRF cookie to an unauthenticated request", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"message":"Unauthorized"}', { status: 401 }));
    const response = await GET(new NextRequest(url), context);
    expect(response.status).toBe(401);
    expect(response.cookies.get(CSRF_COOKIE)?.value).toBe("");
  });

  it("restores the token when a valid session is resumed", async () => {
    const response = await renewSession(new NextRequest("https://merchant.example.test/api/auth/session"));
    expect(response.status).toBe(307);
    expect(response.cookies.get(CSRF_COOKIE)?.value).toBeTruthy();
  });

  it("does not replace a valid token on normal reads", async () => {
    const response = await GET(new NextRequest(url, { headers: { Cookie: `${CSRF_COOKIE}=existing-token` } }), context);
    expect(response.cookies.get(CSRF_COOKIE)).toBeUndefined();
  });

  it.each<Record<string, string>>([
    { Origin: "https://merchant.example.test" },
    { Origin: "https://merchant.example.test", Cookie: `${CSRF_COOKIE}=one`, "X-CSRF-Token": "two" },
    { Origin: "https://foreign.example.test", Cookie: `${CSRF_COOKIE}=one`, "X-CSRF-Token": "one" },
  ])("still rejects unverified mutations before contacting the API", async (headers) => {
    const response = await POST(new NextRequest(url, { method: "POST", headers }), context);
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});

// Exercise the real root route; browser API mocks previously hid its absence.
it("proxies the account summary from the root account endpoint", async () => {
  const response = await accountSummary(new NextRequest("https://merchant.example.test/api/accounts"));
  expect(response.status).toBe(200);
  expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://api.example.test/api/v1/accounts");
});
