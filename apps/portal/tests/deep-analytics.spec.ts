import { expect, test, type Page } from "@playwright/test";

const ZERO = { minor: "0", currency: "EUR", estimated: false, rateTimestamp: null };
const eur = (minor: string) => ({ ...ZERO, minor });

const INSIGHTS = {
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

/**
 * 2026-09-14 and 2026-09-21 are Mondays, 2026-09-19 a Saturday and
 * 2026-09-20 a Sunday. Monday: 2 days, 3 sales, €17.50. Saturday: 1 day,
 * 4 sales, €20.00. Sunday: 1 day with no sales.
 */
const DAILY_TREND = [
  { start: "2026-09-14", amountMinor: "1250", paymentCount: 2 },
  { start: "2026-09-19", amountMinor: "2000", paymentCount: 4 },
  { start: "2026-09-20", amountMinor: "0", paymentCount: 0 },
  { start: "2026-09-21", amountMinor: "500", paymentCount: 1 },
];

function analytics(dailyTrend: typeof DAILY_TREND) {
  const saleCount = dailyTrend.reduce((sum, day) => sum + day.paymentCount, 0);
  const total = dailyTrend.reduce((sum, day) => sum + Number(day.amountMinor), 0);
  return {
    period: {
      from: "2026-09-14T00:00:00.000Z",
      to: "2026-09-21T23:59:59.000Z",
      timezone: "UTC",
      partialCurrentDay: false,
    },
    generatedAt: "2026-09-21T06:00:00.000Z",
    today: { sales: ZERO, saleCount: 0, averageSale: ZERO, topProduct: null, peakSellingHour: null },
    sourceCoverage: { mcbuse_payment: saleCount, merchant_cash: 0, external_import: 0 },
    totalRecordedSales: eur(String(total)),
    saleCount,
    averageSale: eur(saleCount ? String(Math.round(total / saleCount)) : "0"),
    comparisonPercent: null,
    comparisons: { salesPercent: null, transactionCountPercent: null, averageSalePercent: null },
    digitalSales: eur(String(total)),
    cashSales: ZERO,
    dailyTrend,
    hourlyRhythm: [],
    productPerformance: [],
    categoryPerformance: [],
    inventory: {
      stockValueAtSellingPrices: ZERO,
      availableValueAtSellingPrices: ZERO,
      reservedValueAtSellingPrices: ZERO,
      lowStockProductCount: 0,
      zeroStockProductCount: 0,
      valuationBasis: "current_selling_price",
    },
    unassignedItems: [{ name: "Custom cake", quantitySold: 2, totalSales: eur("800") }],
  };
}

test.beforeEach(async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one state proof is enough");
  await context.addCookies([
    {
      name: "mcbuse_portal_access",
      value: "test-only",
      url: "http://127.0.0.1:3101",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.route("**/api/merchant/me/analytics?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(analytics(DAILY_TREND)),
    }),
  );
  await page.route("**/api/merchant/me/insights**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(INSIGHTS) }),
  );
  await page.route("**/api/merchant/me/summary**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        availableValue: ZERO,
        receivedToday: ZERO,
        received30Days: ZERO,
        paymentCount30Days: 0,
        averageSale: ZERO,
        dailyTrend: [],
        hourlyRhythm: [],
        captureQualityPercent: 0,
        lastCapturedAt: null,
        pendingRequestCount: 0,
        problemCount: 0,
        problems: [],
        recordedToday: ZERO,
        recordedSaleCountToday: 0,
        recordedAverageSaleToday: ZERO,
        topProductToday: null,
        peakSellingHourToday: null,
        recorded30Days: ZERO,
        recordedSaleCount30Days: 0,
        recordedAverageSale: ZERO,
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

const patterns = (page: Page) =>
  page.getByRole("region", { name: "Recorded activity patterns" });

const weekdayRow = (page: Page, weekday: string) =>
  patterns(page)
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: weekday, exact: true }) });

test("Deep analytics carries no Unavailable tiles and nothing General analytics already shows", async ({
  page,
}) => {
  await page.goto("/analytics/deep");
  await expect(page.getByRole("heading", { name: "Deep analytics", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Business insights" })).toBeVisible();
  await expect(weekdayRow(page, "Monday")).toBeVisible();

  // Case-sensitive on purpose: "Incoming orders are unavailable." is a real
  // limitation inside an insight and must stay.
  await expect(page.getByText(/Unavailable/)).toHaveCount(0);
  for (const duplicate of [
    "Recorded sales",
    "Transactions",
    "Average transaction",
    "Sales change",
    "Transaction change",
    "Average change",
    "Payment method split",
    "Evidence coverage",
    "Daily recorded sales",
    "Selling patterns",
    "Best-selling products",
    "Slow-moving products",
    "Inventory value",
    "Category performance",
    "Actions",
  ]) {
    await expect(page.getByText(duplicate, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByText("Peak selling hour", { exact: false })).toHaveCount(0);
});

test("the weekday pattern counts recorded sales from the daily trend", async ({ page }) => {
  await page.goto("/analytics/deep");
  await expect(
    patterns(page).getByRole("heading", { name: "Sales by weekday" }),
  ).toBeVisible();
  await expect(weekdayRow(page, "Monday").getByRole("cell")).toHaveText(["2", "3", "€17.50"]);
  await expect(weekdayRow(page, "Saturday").getByRole("cell")).toHaveText(["1", "4", "€20.00"]);
  await expect(weekdayRow(page, "Sunday").getByRole("cell")).toHaveText(["1", "0", "€0.00"]);
  await expect(weekdayRow(page, "Wednesday").getByRole("cell")).toHaveText(["0", "0", "€0.00"]);
  await expect(patterns(page).getByText("Custom cake")).toBeVisible();
  // The period filters sit inside the section they drive.
  await expect(patterns(page).getByRole("radio", { name: "30 days" })).toHaveAttribute("aria-checked", "true");
  await expect(patterns(page).getByRole("button", { name: "Source" })).toBeVisible();
  await expect(page.getByText("Environment", { exact: true })).toHaveCount(0);
});

test("no recorded sales gives an honest empty weekday state, not invented figures", async ({
  page,
}) => {
  await page.route("**/api/merchant/me/analytics?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        analytics(DAILY_TREND.map((day) => ({ ...day, amountMinor: "0", paymentCount: 0 }))),
      ),
    }),
  );
  await page.goto("/analytics/deep");
  await expect(
    patterns(page).getByText("No recorded sales in this period, so there is no weekday pattern to show."),
  ).toBeVisible();
  await expect(patterns(page).getByRole("table")).toHaveCount(0);
});

test("Business insights still render when the analytics request fails", async ({ page }) => {
  // Keeps failing (including any focus-triggered refetch) until the test
  // decides the service has recovered, so the error state is stable.
  let failing = true;
  await page.route("**/api/merchant/me/analytics?*", (route) => {
    if (failing)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Service unavailable" }),
      });
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(analytics(DAILY_TREND)),
    });
  });

  await page.goto("/analytics/deep");
  await expect(page.getByRole("heading", { name: "Business insights" })).toBeVisible();
  await expect(page.getByText("Coffee may reach its minimum stock level soon")).toBeVisible();
  await expect(
    patterns(page).getByText("Recorded activity patterns could not be loaded."),
  ).toBeVisible();
  await expect(patterns(page).getByText("Service unavailable")).toBeVisible();
  await expect(page.getByText("We could not load this")).toHaveCount(0);

  failing = false;
  await patterns(page).getByRole("button", { name: "Try again" }).click();
  await expect(weekdayRow(page, "Monday").getByRole("cell")).toHaveText(["2", "3", "€17.50"]);
  await expect(
    patterns(page).getByText("Recorded activity patterns could not be loaded."),
  ).toHaveCount(0);
});

test("the view switch links to General analytics and marks Deep analytics current", async ({
  page,
}) => {
  await page.goto("/analytics/deep");
  const views = page.getByRole("navigation", { name: "Analytics views" });
  await expect(views.getByRole("button", { name: "Deep analytics" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const general = views.getByRole("link", { name: "General analytics" });
  await expect(general).toHaveAttribute("href", "/analytics/general");
  await general.click();
  await expect(page).toHaveURL(/\/analytics\/general(\?.*)?$/);
});
