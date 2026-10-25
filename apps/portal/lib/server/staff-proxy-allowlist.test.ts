import { describe, expect, it } from "vitest";
import { isAllowedStaffPath } from "./staff-proxy-allowlist";

describe("staff proxy allowlist", () => {
  it("allows the staff areas, including Update now", () => {
    for (const path of [
      "me",
      "credit-assessments",
      "credit-assessments/merchants",
      "credit-assessments/model",
      "credit-assessments/3f1c2b9a-8d7e-4c6b-9a5f-1e2d3c4b5a69",
      "changes/merchants",
      "changes/update-now",
    ])
      expect(isAllowedStaffPath(path)).toBe(true);
  });

  it("denies anything else", () => {
    for (const path of [
      "changes",
      "changes/merchants/extra",
      "changes/update-now/../me",
      "changes/runs",
      "change/update-now",
      "credit-assessments/not-a-uuid",
      "merchants/me/changes",
    ])
      expect(isAllowedStaffPath(path)).toBe(false);
  });
});
