import { describe, expect, it } from "vitest";
import { isAllowedMerchantPath } from "./merchant-proxy-allowlist";

const id = "3f1c2b9a-8d7e-4c6b-9a5f-1e2d3c4b5a69";

describe("merchant proxy allowlist", () => {
  it("allows the Changes routes and product by id", () => {
    for (const path of [
      "me/changes",
      "me/changes/status",
      `me/changes/runs/${id}`,
      `me/changes/${id}`,
      `me/products/${id}`,
      "me/insights",
    ])
      expect(isAllowedMerchantPath(path)).toBe(true);
  });

  it("denies anything else under Changes", () => {
    for (const path of [
      "me/changes/runs",
      "me/changes/not-a-uuid",
      `me/changes/${id}/extra`,
      `me/changes/runs/${id}/extra`,
      "me/changes/settings",
      `other/changes/${id}`,
      "me/changes/../me",
    ])
      expect(isAllowedMerchantPath(path)).toBe(false);
  });
});
