import { describe, expect, it } from "vitest";
import { breadcrumbsFor } from "./breadcrumbs";

const labels = (path: string) =>
  breadcrumbsFor(path).map((crumb) => crumb.label);

describe("breadcrumbsFor", () => {
  it("is just Overview on the Overview page", () => {
    expect(breadcrumbsFor("/overview")).toEqual([
      { label: "Overview", href: "/overview" },
    ]);
  });

  it("starts every section at Overview", () => {
    expect(labels("/inventory")).toEqual(["Overview", "Inventory"]);
    expect(labels("/finance-match")).toEqual(["Overview", "Finance Match"]);
  });

  it("follows nested routes", () => {
    expect(breadcrumbsFor("/payment/transactions")).toEqual([
      { label: "Overview", href: "/overview" },
      { label: "Payment", href: "/payment" },
      { label: "Transactions", href: "/payment/transactions" },
    ]);
    expect(labels("/credit-assessment/reconciliation")).toEqual([
      "Overview",
      "Credit Assessment",
      "Payout reconciliation",
    ]);
  });

  it("links Analytics to the page the menu opens", () => {
    expect(breadcrumbsFor("/analytics/deep")[1]).toEqual({
      label: "Analytics",
      href: "/analytics/general",
    });
  });

  it("ignores trailing slashes and unknown segments", () => {
    expect(labels("/payment/")).toEqual(["Overview", "Payment"]);
    expect(labels("/payment/unknown")).toEqual(["Overview", "Payment"]);
  });
});
