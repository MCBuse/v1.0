import { describe, expect, it } from "vitest";
import { isTrustedPortalOrigin } from "./trusted-origin";

describe("isTrustedPortalOrigin", () => {
  it("accepts equivalent loopback hostnames outside production", () => {
    expect(
      isTrustedPortalOrigin(
        "http://127.0.0.1:3001",
        "http://localhost:3001",
        "development",
      ),
    ).toBe(true);
  });

  it("keeps exact-origin enforcement in production", () => {
    expect(
      isTrustedPortalOrigin(
        "http://127.0.0.1:3001",
        "http://localhost:3001",
        "production",
      ),
    ).toBe(false);
  });

  it("accepts each configured production portal origin", () => {
    const origins = [
      "https://merchant.mcbuse.com",
      "https://mcbuse-portal-332810840225.europe-west1.run.app",
    ];
    expect(
      isTrustedPortalOrigin("https://merchant.mcbuse.com", origins, "production"),
    ).toBe(true);
    expect(
      isTrustedPortalOrigin(
        "https://mcbuse-portal-332810840225.europe-west1.run.app",
        origins,
        "production",
      ),
    ).toBe(true);
  });

  it("rejects different ports and non-loopback origins", () => {
    expect(
      isTrustedPortalOrigin(
        "http://127.0.0.1:3002",
        "http://localhost:3001",
        "development",
      ),
    ).toBe(false);
    expect(
      isTrustedPortalOrigin(
        "https://example.com",
        "http://localhost:3001",
        "development",
      ),
    ).toBe(false);
  });
});
