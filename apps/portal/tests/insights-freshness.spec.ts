import { expect, test } from "@playwright/test";

const BASE = {
  status: "ready",
  calculationVersion: "merchant-intelligence-v1",
  generatedAt: "2026-09-21T06:00:00.000Z",
  stale: false,
  snapshot: { metrics: {} },
  scope: {
    label: "all_recorded_activity",
    periodFrom: "2026-06-23T00:00:00.000Z",
    periodTo: "2026-09-21T06:00:00.000Z",
    mixedData: false,
    sourceCoverage: { live: 12 },
  },
  insights: [
    {
      id: "one",
      code: "stock_risk.p1",
      kind: "stock_risk",
      priority: 10,
      title: "Coffee may reach its minimum stock level soon",
      summary: "Recorded demand suggests a review.",
      recommendation: "Review replenishment timing.",
      evidence: [{ id: "product:p1", label: "Coffee", value: "8 units" }],
      limitations: ["Incoming orders are unavailable."],
      narrationSource: "deterministic",
    },
  ],
  message: null,
  freshness: {
    generatedAt: "2026-09-21T06:00:00.000Z",
    ageSeconds: 600,
    stale: false,
    staleAfterMinutes: 375,
  },
  lastFailure: null,
};

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([
    {
      name: "mcbuse_portal_access",
      value: "test-only",
      url: "http://127.0.0.1:3101",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.route("**/api/merchant/me/summary**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        availableValue: { minor: "0", currency: "EUR", estimated: false, rateTimestamp: null },
        receivedToday: { minor: "0", currency: "EUR", estimated: false, rateTimestamp: null },
        received30Days: { minor: "0", currency: "EUR", estimated: false, rateTimestamp: null },
        paymentCount30Days: 0,
        averageSale: { minor: "0", currency: "EUR", estimated: false, rateTimestamp: null },
        dailyTrend: [],
        hourlyRhythm: [],
        captureQualityPercent: 0,
        lastCapturedAt: null,
        pendingRequestCount: 0,
        problemCount: 0,
        problems: [],
        recordedToday: { minor: "0", currency: "EUR", estimated: false, rateTimestamp: null },
        recordedSaleCountToday: 0,
        recordedAverageSaleToday: { minor: "0", currency: "EUR", estimated: false, rateTimestamp: null },
        topProductToday: null,
        peakSellingHourToday: null,
        recorded30Days: { minor: "0", currency: "EUR", estimated: false, rateTimestamp: null },
        recordedSaleCount30Days: 0,
        recordedAverageSale: { minor: "0", currency: "EUR", estimated: false, rateTimestamp: null },
        recordedDailyTrend: [],
        recordedHourlyRhythm: [],
        lowStockProductCount: 0,
        readinessStage: "building_history",
        lastUpdatedAt: new Date().toISOString(),
      }),
    }),
  );
  await page.route("**/api/merchant/me/activity**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [], page: 1, pageSize: 5, totalItems: 0, totalPages: 1 }),
    }),
  );
});

test("N.14 — a refused insights route says so instead of showing nothing", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one state proof is enough");

  // Exactly the shape of the bug: the proxy refused the route, and the panel
  // rendered as though the merchant simply had no insights.
  await page.route("**/api/merchant/me/insights**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: "Not found" }),
    }),
  );

  await page.goto("/overview");
  await expect(page.getByText("Insights could not be loaded.")).toBeVisible();
  await expect(
    page.getByText("not a finding that there is nothing to report", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try again" }).first(),
  ).toBeVisible();
});

test("N.14 — a server error is reported rather than swallowed", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one state proof is enough");

  await page.route("**/api/merchant/me/insights**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Service unavailable" }),
    }),
  );

  await page.goto("/overview");
  await expect(page.getByText("Insights could not be loaded.")).toBeVisible();
  await expect(page.getByText("Service unavailable")).toBeVisible();
});

test("N.13 — freshness is shown on a current calculation", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one state proof is enough");

  await page.route("**/api/merchant/me/insights**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(BASE) }),
  );

  await page.goto("/overview");
  await expect(page.getByText("Current")).toBeVisible();
  await expect(page.getByText("Last updated", { exact: false })).toBeVisible();
  await expect(
    page.getByText("The last recalculation failed", { exact: false }),
  ).toHaveCount(0);
});

test("N.13 — a failed recalculation is reported alongside the figures", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one state proof is enough");

  await page.route("**/api/merchant/me/insights**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...BASE,
        stale: true,
        freshness: { ...BASE.freshness, stale: true, ageSeconds: 40_000 },
        lastFailure: {
          at: "2026-09-21T05:00:00.000Z",
          reason: "insight engine timed out",
          attempts: 3,
        },
      }),
    }),
  );

  await page.goto("/overview");
  await expect(page.getByText("Update delayed")).toBeVisible();
  await expect(
    page.getByText("The last recalculation failed", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("insight engine timed out", { exact: false })).toBeVisible();
  await expect(page.getByText("3 attempts since", { exact: false })).toBeVisible();
  // The insights that did load are still shown: the failure is a caveat, not
  // a reason to hide what is known.
  await expect(
    page.getByText("Coffee may reach its minimum stock level soon"),
  ).toBeVisible();
});

test("a delayed refresh keeps the last good insights on screen", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one state proof is enough");

  let calls = 0;
  await page.route("**/api/merchant/me/insights**", (route) => {
    calls += 1;
    if (calls === 1)
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(BASE),
      });
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Service unavailable" }),
    });
  });

  await page.goto("/overview");
  await expect(
    page.getByText("Coffee may reach its minimum stock level soon"),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("merchant:refresh")));
  await expect.poll(() => calls).toBeGreaterThan(1);
  await expect(
    page.getByText("These insights are the last ones that loaded", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Coffee may reach its minimum stock level soon"),
  ).toBeVisible();
});
