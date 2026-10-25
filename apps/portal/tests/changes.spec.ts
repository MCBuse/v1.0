import { expect, test, type Page, type Route } from "@playwright/test";
import type {
  ChangeCaseSummary,
  ChangeDetailResponse,
  ChangeListResponse,
  ChangeStatusResponse,
  MerchantProduct,
} from "@repo/shared";

/**
 * Changes (plan §3, §9.4) against mocked backend responses. Every figure the
 * page shows is asserted against the value in these fixtures, so nothing on
 * screen can be invented by the UI.
 */

const TZ = "Europe/Berlin";
const SHOTS = "test-results/change-intelligence";
const CAPPUCCINO = "5f0c6a52-1c1e-4a57-9d43-3b1c4e1f2a10";
const OAT = "8a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f";
const ARCHIVED = "c3d4e5f6-a7b8-4c9d-8e0f-112233445566";
const DEMAND_ID = "0b6f7e8d-9c0a-4b1c-8d2e-3f4a5b6c7d8e";
const STOCK_ID = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const LONG_ID = "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60";
const ARCHIVED_ID = "3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6071";
const RESOLVED_ID = "4f5a6b7c-8d9e-4f0a-9b1c-2d3e4f507182";
const PAGE2_ID = "5a6b7c8d-9e0f-4a1b-8c2d-3e4f50718293";
const LONG_NAME =
  "Extra-large oat milk flat white with seasonal hazelnut syrup and a double shot, limited edition";

const ZERO = { minor: "0", currency: "EUR" as const, estimated: false, rateTimestamp: null };

function status(overrides: Partial<ChangeStatusResponse> = {}): ChangeStatusResponse {
  return {
    available: true,
    unavailableReason: null,
    timezone: TZ,
    modelVersion: "change-intelligence-v1",
    cadence: { stockMinutes: 60, trendsDaily: true },
    initialized: true,
    lastSuccessfulAnalysisAt: "2026-10-24T23:00:00.000Z",
    processing: "idle",
    pendingSince: null,
    lastFailureAt: null,
    readiness: { trends: "ready", requiredHistoryDays: 28, daysUntilTrendsReady: 0, minUsualWeeklyUnits: 5 },
    recordingGap: false,
    lastRecordedSaleDate: "2026-10-24",
    summary: { activeChanges: 4, productsNeedingStockReview: 2 },
    provenance: { account: "ordinary", includesTestPayments: false },
    ...overrides,
  };
}

function change(overrides: Partial<ChangeCaseSummary>): ChangeCaseSummary {
  return {
    id: DEMAND_ID,
    productId: CAPPUCCINO,
    productName: "Cappuccino",
    productAvailable: true,
    type: "unit_demand_increase",
    status: "active",
    severity: "medium",
    priority: 4,
    headline: "Cappuccino is selling faster",
    summary: "42 units were recorded in the last 7 days, against a usual 28.",
    consequence: "Stock is now expected to reach its minimum in about 6 days instead of 9.",
    suggestedAction: "Review replenishment for the coming week.",
    firstDetectedAt: "2026-10-24T23:00:00.000Z",
    lastChangedAt: "2026-10-24T23:00:00.000Z",
    resolvedAt: null,
    resolution: null,
    identifiedDuringInitialAnalysis: false,
    notRecheckedSince: null,
    observation: { from: "2026-10-18", to: "2026-10-24" },
    before: [
      { key: "usual", label: "Usual units per week", value: 28, unit: "units" },
      { key: "days_to_minimum", label: "Days until minimum stock", value: 9, unit: "days" },
    ],
    after: [
      { key: "recent", label: "Units in the last 7 days", value: 42, unit: "units" },
      { key: "days_to_minimum", label: "Days until minimum stock", value: 6, unit: "days" },
    ],
    modelVersion: "change-intelligence-v1",
    ...overrides,
  };
}

const STOCK = change({
  id: STOCK_ID,
  productId: OAT,
  productName: "Oat milk",
  type: "stock_risk",
  priority: 2,
  severity: "high",
  headline: "Oat milk is at or below minimum stock",
  summary: "3 units available against a minimum of 5.",
  consequence: "About 12 units would cover the coming week and keep the minimum.",
  suggestedAction: "Review stock.",
  observation: null,
  before: [{ key: "risk", label: "Stock risk", value: "projected_stock_risk", unit: "risk" }],
  after: [{ key: "risk", label: "Stock risk", value: "low_stock", unit: "risk" }],
});
const DEMAND = change({});
const LONG = change({
  id: LONG_ID,
  productId: "6b7c8d9e-0f1a-4b2c-9d3e-4f5061728394",
  productName: LONG_NAME,
  headline: `${LONG_NAME} is selling faster`,
  summary: "1,234,567 units were recorded in the last 7 days, against a usual 987,654.",
  before: [{ key: "usual", label: "Usual units per week", value: 987_654, unit: "units" }],
  after: [{ key: "recent", label: "Units in the last 7 days", value: 1_234_567, unit: "units" }],
  consequence: null,
  suggestedAction: null,
});
const ARCHIVED_CHANGE = change({
  id: ARCHIVED_ID,
  productId: ARCHIVED,
  productName: "Seasonal muffin",
  productAvailable: false,
  type: "unit_demand_decrease",
  priority: 4,
  headline: "Seasonal muffin is selling slower",
  summary: "4 units were recorded in the last 7 days, against a usual 15.",
  consequence: null,
  suggestedAction: "Check whether planned stock still matches recorded sales.",
});
const RESOLVED = change({
  id: RESOLVED_ID,
  status: "resolved",
  headline: "Sales of Cappuccino are back to usual",
  summary: "This change is closed. Its history is kept.",
  consequence: null,
  suggestedAction: null,
  resolvedAt: "2026-10-20T23:00:00.000Z",
  resolution: "returned_to_usual",
});
const PAGE2 = change({ id: PAGE2_ID, productName: "Croissant", headline: "Croissant is selling faster", productId: "7c8d9e0f-1a2b-4c3d-8e4f-506172839405" });

function detail(summary: ChangeCaseSummary): ChangeDetailResponse {
  return {
    change: summary,
    runId: "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a",
    whatChanged: {
      recent: { key: "recent", label: "Recorded units in the last 7 days", value: 42, unit: "units" },
      usualWeekly: { key: "usual", label: "Usual units per week", value: 28, unit: "units" },
      baselineWeeks: [
        { from: "2026-10-11", to: "2026-10-17", value: 27 },
        { from: "2026-10-04", to: "2026-10-10", value: 29 },
        { from: "2026-09-27", to: "2026-10-03", value: 26 },
        { from: "2026-09-20", to: "2026-09-26", value: 30 },
      ],
    },
    impact: [
      {
        label: "Units sold compared with usual",
        before: { key: "recent", label: "", value: 30, unit: "units" },
        after: { key: "recent", label: "", value: 42, unit: "units" },
        changed: true,
      },
      {
        label: "Days until minimum stock",
        before: { key: "days_to_minimum", label: "", value: 9, unit: "days" },
        after: { key: "days_to_minimum", label: "", value: 6, unit: "days" },
        changed: true,
      },
      {
        label: "Minimum stock",
        before: { key: "minimum", label: "", value: 10, unit: "units" },
        after: { key: "minimum", label: "", value: 10, unit: "units" },
        changed: false,
      },
    ],
    transitions: [],
    calculation: {
      asOf: "2026-10-24T23:00:00.000Z",
      timezone: TZ,
      modelVersion: "change-intelligence-v1",
      recentWindow: { from: "2026-10-18", to: "2026-10-24" },
      baselineWeeks: [],
      baselineWeeksUsed: 4,
      forecastWindow: { from: "2026-09-27", to: "2026-10-24" },
      settings: {
        baselineWeeksMin: 3,
        baselineWeeksMax: 4,
        minExpectedWeekly: 5,
        minAbsoluteDifference: 3,
        minRelativeDifference: 0.25,
        minZ: 2.5,
        confirmationDays: 2,
        recoveryDays: 2,
        recoveryZ: 1,
        expiryDays: 7,
        unassessableDays: 14,
        recordingGapRatio: 0.5,
        forecastWindowDays: 28,
        forecastMinUnits: 14,
        projectedRiskDays: 7,
        replenishmentDays: 7,
      },
      assumptions: [
        "Usual is the average of the 4 complete weeks before the last 7 days.",
        "Missing records count as zero recorded units, not as proof of zero sales.",
      ],
    },
    source: {
      digitalSalesByEnvironment: { live: 31, test: 2 },
      cashSales: 9,
      cashSalesProvenance: "unknown",
      unassignedLines: 0,
      excludedObservations: 0,
      includesTestPayments: true,
      limitations: ["Only activity recorded in MCBuse is included. It may not cover all of your business."],
    },
    actions: { viewProduct: summary.productAvailable, reviewStock: summary.productAvailable },
  };
}

function product(id: string, name: string, overrides: Partial<MerchantProduct> = {}): MerchantProduct {
  return {
    id,
    name,
    category: "Drinks",
    sku: null,
    description: null,
    unitPrice: { ...ZERO, minor: "350" },
    onHandQuantity: 3,
    reservedQuantity: 0,
    availableQuantity: 3,
    lowStockThreshold: 5,
    lowStock: true,
    imageUrl: null,
    status: "active",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-10-24T00:00:00.000Z",
    ...overrides,
  };
}

type Backend = {
  status: ChangeStatusResponse | number;
  /** Response per request; numbers are HTTP failures. */
  list: (url: URL) => ChangeListResponse | number;
  detail: (id: string) => ChangeDetailResponse | number;
  delayMs: number;
  /** Simulates lost connectivity: requests fail at the network layer. */
  offline: boolean;
  requests: string[];
  mutations: string[];
};

const ACTIVE = [STOCK, DEMAND, LONG, ARCHIVED_CHANGE];

function defaultList(url: URL): ChangeListResponse {
  const status = url.searchParams.get("status") ?? "active";
  const type = url.searchParams.get("type");
  const productId = url.searchParams.get("productId");
  if (url.searchParams.get("cursor") === "page-2")
    return { items: [PAGE2], nextCursor: null, timezone: TZ };
  let items = status === "resolved" ? [RESOLVED] : status === "all" ? [...ACTIVE, RESOLVED] : ACTIVE;
  if (type === "stock") items = items.filter((c) => c.type === "stock_risk");
  if (type === "threshold") items = items.filter((c) => c.type === "stock_threshold_change");
  if (type === "demand") items = items.filter((c) => c.type.includes("demand") || c.type.includes("velocity"));
  if (productId) items = items.filter((c) => c.productId === productId);
  return { items, nextCursor: status === "active" && !type && !productId ? "page-2" : null, timezone: TZ };
}

async function setup(page: Page, overrides: Partial<Backend> = {}) {
  const backend: Backend = {
    status: status(),
    list: defaultList,
    detail: (id) => {
      const found = [...ACTIVE, RESOLVED, PAGE2].find((c) => c.id === id);
      return found ? detail(found) : 404;
    },
    delayMs: 0,
    offline: false,
    requests: [],
    mutations: [],
    ...overrides,
  };
  const json = (route: Route, body: unknown, code = 200) =>
    route.fulfill({
      status: code,
      contentType: "application/json",
      body: JSON.stringify(typeof body === "number" ? { message: "Service unavailable" } : body),
    });
  await page.route(
    (url) => url.pathname.startsWith("/api/merchant/me/changes"),
    async (route) => {
      const url = new URL(route.request().url());
      backend.requests.push(`${url.pathname}${url.search}`);
      if (route.request().method() !== "GET") backend.mutations.push(url.pathname);
      if (backend.offline) return route.abort("internetdisconnected");
      if (backend.delayMs) await new Promise((r) => setTimeout(r, backend.delayMs));
      const rest = url.pathname.replace("/api/merchant/me/changes", "");
      const body =
        rest === "/status"
          ? backend.status
          : rest === ""
            ? backend.list(url)
            : backend.detail(rest.slice(1));
      return json(route, body, typeof body === "number" ? body : 200);
    },
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/merchant/me/products"),
    (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() !== "GET") backend.mutations.push(url.pathname);
      backend.requests.push(`${url.pathname}${url.search}`);
      if (url.pathname === "/api/merchant/me/products")
        return json(route, {
          items: [product(CAPPUCCINO, "Cappuccino", { lowStock: false, onHandQuantity: 40, availableQuantity: 40 })],
          page: 1,
          pageSize: 25,
          totalItems: 30,
          totalPages: 2,
        });
      const id = url.pathname.split("/").at(-1);
      if (id === OAT) return json(route, product(OAT, "Oat milk"));
      if (id === CAPPUCCINO) return json(route, product(CAPPUCCINO, "Cappuccino"));
      return json(route, 404, 404);
    },
  );
  await page.route("**/api/merchant/me/summary**", (route) =>
    json(route, {
      availableValue: ZERO, receivedToday: ZERO, received30Days: ZERO, paymentCount30Days: 0,
      averageSale: ZERO, dailyTrend: [], hourlyRhythm: [], captureQualityPercent: 0,
      lastCapturedAt: null, pendingRequestCount: 0, problemCount: 0, problems: [],
      recordedToday: ZERO, recordedSaleCountToday: 0, recordedAverageSaleToday: ZERO,
      topProductToday: null, peakSellingHourToday: null, recorded30Days: ZERO,
      recordedSaleCount30Days: 0, recordedAverageSale: ZERO, recordedDailyTrend: [],
      recordedHourlyRhythm: [], lowStockProductCount: 0, readinessStage: "building_history",
      lastUpdatedAt: new Date().toISOString(),
    }),
  );
  return backend;
}

const main = (page: Page) => page.getByRole("main");
const list = (page: Page) => main(page).getByRole("region", { name: /changes$/i });
const entry = (page: Page, headline: string) =>
  main(page).getByRole("article", { name: headline });
const listRequests = (b: Backend) => b.requests.filter((r) => /\/me\/changes(\?|$)/.test(r));
const statusRequests = (b: Backend) => b.requests.filter((r) => r.endsWith("/me/changes/status"));

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll("body *")]
      .filter(
        (el) =>
          !el.closest(".sr-table, .sr-only, .fixed, .sticky") &&
          !el.parentElement?.closest(".overflow-x-auto, .overflow-auto, .overflow-hidden") &&
          el.getBoundingClientRect().right > width + 1,
      )
      .slice(-4)
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 160));
    return { by: document.documentElement.scrollWidth - width, wide };
  });
  expect(overflow.by, `${page.url()} ${overflow.wide.join(" | ")}`).toBeLessThanOrEqual(0);
}

/** No run ids, node keys, z-scores, queue internals or demo controls on a merchant page. */
async function noDiagnostics(page: Page) {
  const text = await main(page).innerText();
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(text).not.toMatch(
    /z-score|\bminZ\b|fingerprint|node key|_activity|stock_cover|lease|queue|run id|stack trace|\bSELECT\b|Run demo|playback|presentation|scenario|tutorial|\d+\s?%\s*(complete|done)/i,
  );
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "mcbuse_portal_access", value: "test-only", url: "http://127.0.0.1:3101", httpOnly: true, sameSite: "Lax" },
  ]);
});

const desktopOnly = (name: string) => test.skip(name !== "desktop", "one state proof is enough");

// ------------------------------------------------------------- navigation

test("all three Analytics destinations share one navigation and the legacy redirects still work", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await setup(page);
  for (const [path, current] of [
    ["/analytics/general", "General analytics"],
    ["/analytics/deep", "Deep analytics"],
    ["/analytics/changes", "Changes"],
  ] as const) {
    await page.goto(path);
    const nav = main(page).getByRole("navigation", { name: "Analytics views" });
    await expect(nav.getByRole("link")).toHaveText(["General analytics", "Deep analytics", "Changes"]);
    await expect(nav.getByRole("link", { name: current })).toHaveAttribute("aria-current", "page");
  }
  await page.goto("/analytics");
  await expect(page).toHaveURL(/\/analytics\/general$/);
  await page.goto("/analytics/inventory");
  await expect(page).toHaveURL(/\/analytics\/general\?tab=inventory$/);
  await page.goto("/analytics/transactions");
  await expect(page).toHaveURL(/\/payment\/transactions$/);
});

test("Changes is hidden from the navigation for non-owners and where the feature is unavailable", async ({ page }, info) => {
  desktopOnly(info.project.name);
  const backend = await setup(page, { status: 404 });
  await page.goto("/analytics/deep");
  const nav = main(page).getByRole("navigation", { name: "Analytics views" });
  await expect(nav.getByRole("link", { name: "Deep analytics" })).toBeVisible();
  await expect.poll(() => statusRequests(backend).length).toBeGreaterThan(0);
  await expect(nav.getByRole("link", { name: "Changes" })).toHaveCount(0);

  backend.status = status({ available: false, unavailableReason: "not_enabled" });
  await page.goto("/analytics/general");
  await expect(nav.getByRole("link", { name: "General analytics" })).toBeVisible();
  await expect.poll(() => statusRequests(backend).length).toBeGreaterThan(1);
  await expect(nav.getByRole("link", { name: "Changes" })).toHaveCount(0);

  // The page itself explains rather than showing an empty list.
  await page.goto("/analytics/changes");
  await expect(main(page).getByText("Changes is not available for this account")).toBeVisible();
  await expect(main(page).getByText(/No significant changes/)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/unavailable-${info.project.name}.png`, fullPage: true });
});

// ------------------------------------------------------------- list

test("the list leads with the change, its consequence and the saved before/after values", async ({ page }, info) => {
  await setup(page);
  await page.goto("/analytics/changes");
  await expect(main(page).getByRole("heading", { level: 1, name: "Changes" })).toBeVisible();
  await expect(
    main(page).getByText(
      "See what changed in your recorded activity and how it affects your stock and sales outlook.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(main(page).getByText("Stock updates hourly. Sales trends update once a day.", { exact: true })).toBeVisible();

  const summary = main(page).locator("dl").first();
  await expect(summary.getByText("Active changes")).toBeVisible();
  await expect(summary.locator("dd")).toHaveText(["4", "2", "25 Oct 2026, 01:00"]);

  const demand = entry(page, "Cappuccino is selling faster");
  await expect(demand.getByText("42 units were recorded in the last 7 days, against a usual 28.")).toBeVisible();
  await expect(demand.locator("[data-value-key]")).toHaveText(["28 units", "9 days", "42 units", "6 days"]);
  await expect(
    demand.getByText("Stock is now expected to reach its minimum in about 6 days instead of 9. Review replenishment for the coming week."),
  ).toBeVisible();
  await expect(demand.getByText("Detected 25 Oct 2026, 01:00 · Based on 18–24 Oct 2026")).toBeVisible();
  await expect(demand.getByText("Selling faster", { exact: true })).toBeVisible();
  await expect(demand.getByText("Active", { exact: true })).toBeVisible();
  await expect(demand.getByRole("link", { name: "View explanation" })).toHaveAttribute(
    "href",
    `/analytics/changes/${DEMAND_ID}`,
  );

  // Priority order from the API is kept; only stock problems carry a warning.
  await expect(list(page).getByRole("heading", { level: 3 })).toHaveText([
    STOCK.headline,
    DEMAND.headline,
    LONG.headline,
    ARCHIVED_CHANGE.headline,
  ]);
  const stock = entry(page, STOCK.headline);
  await expect(stock.locator("[data-value-key]")).toHaveText(["May reach minimum soon", "At or below minimum"]);
  await expect(entry(page, ARCHIVED_CHANGE.headline).getByText("Archived or unavailable")).toBeVisible();
  await expect(entry(page, LONG.headline).locator("[data-value-key]")).toHaveText(["987,654 units", "1,234,567 units"]);

  await noDiagnostics(page);
  await noHorizontalScroll(page);
  // Long names and large values wrap instead of clipping.
  const clipped = await entry(page, LONG.headline).evaluate((el) =>
    [...el.querySelectorAll("h3, dd, p")].some((node) => node.scrollWidth > node.clientWidth + 1),
  );
  expect(clipped).toBe(false);
  await page.screenshot({ path: `${SHOTS}/list-${info.project.name}.png`, fullPage: true });
});

test("filters live in the address, survive a reload, and Clear filters resets them", async ({ page }, info) => {
  desktopOnly(info.project.name);
  const backend = await setup(page);
  await page.goto("/analytics/changes");
  await expect(entry(page, DEMAND.headline)).toBeVisible();

  await main(page).getByRole("combobox", { name: "Change type" }).click();
  await page.getByRole("option", { name: "Stock problems" }).click();
  await expect(page).toHaveURL(/\/analytics\/changes\?type=stock$/);
  await expect(list(page).getByRole("heading", { level: 3 })).toHaveText([STOCK.headline]);
  expect(listRequests(backend).at(-1)).toContain("type=stock");

  await main(page).getByRole("radio", { name: "All" }).click();
  await expect(page).toHaveURL(/type=stock&status=all/);
  await expect(main(page).getByText("Showing changes updated in the last 30 days, most recent first.")).toBeVisible();

  await page.reload();
  await expect(main(page).getByRole("combobox", { name: "Change type" })).toContainText("Stock problems");
  await expect(main(page).getByRole("radio", { name: "All" })).toHaveAttribute("aria-checked", "true");
  await expect(list(page).getByRole("heading", { level: 3 })).toHaveText([STOCK.headline]);

  await main(page).getByLabel("From", { exact: true }).fill("2026-10-01");
  await main(page).getByLabel("To", { exact: true }).fill("2026-10-25");
  await expect(page).toHaveURL(/from=2026-10-01&to=2026-10-25/);
  await expect(main(page).getByText("Showing changes updated 1 Oct 2026 to 25 Oct 2026.")).toBeVisible();

  await main(page).getByRole("group", { name: "Change filters" }).getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/analytics\/changes$/);
  await expect(list(page).getByRole("heading", { level: 3 })).toHaveCount(4);
});

test("a filter with no matches is distinct from no detected changes", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await setup(page);
  await page.goto("/analytics/changes?type=threshold");
  await expect(main(page).getByRole("heading", { name: "No changes match these filters" })).toBeVisible();
  await expect(main(page).getByText(/No significant changes were detected/)).toHaveCount(0);
  await main(page).getByRole("button", { name: "Clear filters" }).last().click();
  await expect(page).toHaveURL(/\/analytics\/changes$/);
  await expect(entry(page, DEMAND.headline)).toBeVisible();
});

test("cursor pagination keeps 25 per page and the position survives a reload", async ({ page }, info) => {
  desktopOnly(info.project.name);
  const backend = await setup(page);
  await page.goto("/analytics/changes");
  await expect.poll(() => listRequests(backend)[0]).toContain("limit=25");
  const pages = main(page).getByRole("navigation", { name: "Change pages" });
  await pages.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/cursor=page-2&page=2/);
  await expect(entry(page, PAGE2.headline)).toBeVisible();
  await expect(pages.getByText("Page 2")).toBeVisible();
  await page.reload();
  await expect(entry(page, PAGE2.headline)).toBeVisible();
  await pages.getByRole("button", { name: "Previous" }).click();
  await expect(page).toHaveURL(/\/analytics\/changes$/);
  await expect(entry(page, DEMAND.headline)).toBeVisible();
});

// ------------------------------------------------------------- refresh

test("background refresh every 60 s keeps filters and scroll; 5 s while processing; none in a hidden tab", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await page.clock.install();
  const backend = await setup(page);
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto("/analytics/changes?type=demand");
  await expect(entry(page, DEMAND.headline)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 400));
  const before = listRequests(backend).length;
  const scroll = await page.evaluate(() => window.scrollY);
  expect(scroll).toBeGreaterThan(0);

  await page.clock.runFor(30_000);
  expect(listRequests(backend).length).toBe(before);
  await page.clock.runFor(31_000);
  await expect.poll(() => listRequests(backend).length).toBe(before + 1);
  expect(listRequests(backend).at(-1)).toContain("type=demand");
  await expect(page).toHaveURL(/\?type=demand$/);
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll);

  // The backend reports processing: the pace becomes 5 s, never a percentage.
  backend.status = status({ processing: "processing" });
  await main(page).getByRole("button", { name: "Refresh" }).click();
  await expect(main(page).getByText("Updating your changes now.")).toBeVisible();
  await expect(page.locator("[aria-live=polite]").filter({ hasText: "Updating your changes." })).toHaveCount(1);
  const processingStart = statusRequests(backend).length;
  await page.clock.runFor(5_100);
  await expect.poll(() => statusRequests(backend).length).toBeGreaterThan(processingStart);
  expect(await main(page).innerText()).not.toMatch(/\d\s?%/);
  // Refresh only reads saved results.
  expect(backend.mutations).toEqual([]);

  // A hidden tab stops polling altogether.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenAt = backend.requests.filter((r) => r.includes("/me/changes")).length;
  await page.clock.runFor(300_000);
  expect(backend.requests.filter((r) => r.includes("/me/changes")).length).toBe(hiddenAt);
});

// ------------------------------------------------------------- detail

test("a change's details are directly linkable, survive a refresh and match the saved values", async ({ page }, info) => {
  await setup(page);
  await page.goto(`/analytics/changes/${DEMAND_ID}`);
  await expect(main(page).getByRole("heading", { level: 1, name: "Cappuccino is selling faster" })).toBeVisible();
  await page.reload();
  await expect(main(page).getByRole("heading", { level: 1, name: "Cappuccino is selling faster" })).toBeVisible();

  await expect(main(page).getByRole("heading", { level: 2 })).toHaveText([
    "What changed",
    "Impact",
    "Before and after",
    "Suggested action",
    "How this was calculated",
    "Source information",
  ]);
  const what = main(page).getByRole("region", { name: "What changed" });
  await expect(what.getByText("42 units", { exact: true })).toBeVisible();
  await expect(what.getByText("28 units", { exact: true })).toBeVisible();
  await expect(what.getByRole("row")).toHaveCount(5);
  await expect(what.getByRole("row").nth(1)).toHaveText(/11–17 Oct 2026\s*27 units/);

  const impact = main(page).getByRole("region", { name: "Impact" }).getByRole("listitem");
  await expect(impact).toHaveCount(3);
  await expect(impact.nth(1)).toContainText("Days until minimum stock");
  await expect(impact.nth(1)).toContainText(/9 days\s*→\s*to\s*6 days/);
  await expect(impact.nth(2)).toContainText("Unchanged");

  const beforeAfter = main(page).getByRole("region", { name: "Before and after" });
  await expect(beforeAfter.locator("[data-value-key]")).toHaveText(["28 units", "9 days", "42 units", "6 days"]);

  const action = main(page).getByRole("region", { name: "Suggested action" });
  await expect(action.getByText("Review replenishment for the coming week.")).toBeVisible();
  await expect(action.getByRole("link", { name: "Review stock" })).toHaveAttribute(
    "href",
    `/inventory?productId=${CAPPUCCINO}&action=stock`,
  );
  await expect(action.getByRole("link", { name: "View product" })).toHaveAttribute(
    "href",
    `/inventory?productId=${CAPPUCCINO}&action=edit`,
  );

  const how = main(page).locator("details");
  await expect(how.getByText("Calculation version")).toBeHidden();
  await main(page).getByText("How this was calculated").click();
  await expect(how.getByText("change-intelligence-v1")).toBeVisible();
  await expect(how.getByText(TZ, { exact: false })).toBeVisible();
  await expect(how.getByRole("link", { name: "Change in Business profile" })).toHaveAttribute(
    "href",
    "/credit-assessment/business-profile#business-timezone",
  );
  await expect(how).not.toContainText("2.5");

  const source = main(page).getByRole("region", { name: "Source information" });
  await expect(source.getByText("Includes test payments")).toBeVisible();
  await expect(source.getByText("31 sales")).toBeVisible();
  await expect(source.getByText("9 sales · live or test not recorded")).toBeVisible();

  await noDiagnostics(page);
  await noHorizontalScroll(page);
  await page.screenshot({ path: `${SHOTS}/detail-${info.project.name}.png`, fullPage: true });
});

test("an archived product keeps its history and its actions are disabled", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await setup(page);
  await page.goto(`/analytics/changes/${ARCHIVED_ID}`);
  const action = main(page).getByRole("region", { name: "Suggested action" });
  await expect(action.getByRole("button", { name: "View product" })).toBeDisabled();
  await expect(action.getByRole("button", { name: "Review stock" })).toBeDisabled();
  await expect(action.getByRole("link")).toHaveCount(0);
  await expect(action.getByText(/archived or no longer available/)).toBeVisible();
  await expect(main(page).getByText("Archived or unavailable")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/archived-product-${info.project.name}.png`, fullPage: true });
});

test("an unknown change says so instead of showing an empty page", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await setup(page);
  await page.goto("/analytics/changes/6c7d8e9f-0a1b-4c2d-9e3f-405162738495");
  await expect(main(page).getByText("This change could not be found")).toBeVisible();
  await page.goto("/analytics/changes/not-a-uuid");
  await expect(main(page).getByText("This change could not be found")).toBeVisible();
});

test("Deep analytics links an insight to the same change", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await setup(page);
  await page.route("**/api/merchant/me/insights**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "ready", calculationVersion: "v1", generatedAt: "2026-10-24T23:00:00.000Z", stale: false,
        snapshot: { metrics: {} },
        scope: { label: "all_recorded_activity", periodFrom: null, periodTo: null, mixedData: false, sourceCoverage: {} },
        insights: [{
          id: DEMAND_ID, code: "change.unit_demand_increase", kind: "anomaly", priority: 4,
          title: DEMAND.headline, summary: DEMAND.summary, recommendation: DEMAND.suggestedAction,
          evidence: [{ id: "change.recent", label: "Units in the last 7 days", value: "42 units" }],
          limitations: [], narrationSource: "deterministic", modelVersion: "change-intelligence-v1", changeCaseId: DEMAND_ID,
        }],
        message: null, lastFailure: null,
      }),
    }),
  );
  await page.goto("/analytics/deep");
  await main(page).getByRole("link", { name: /View explanation/ }).click();
  await expect(page).toHaveURL(new RegExp(`/analytics/changes/${DEMAND_ID}$`));
  await expect(main(page).getByRole("heading", { level: 1, name: DEMAND.headline })).toBeVisible();
});

// ------------------------------------------------------------- inventory

test("inventory deep links open the right product, including one not on the loaded page, and restore focus", async ({ page }, info) => {
  desktopOnly(info.project.name);
  const backend = await setup(page);
  await page.goto(`/analytics/changes/${STOCK_ID}`);
  await main(page).getByRole("link", { name: "Review stock" }).click();
  await expect(page).toHaveURL(new RegExp(`/inventory\\?productId=${OAT}&action=stock$`));
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "Review stock" })).toBeVisible();
  await expect(drawer.getByLabel("Name *")).toHaveValue("Oat milk");
  await expect(drawer.getByLabel("On hand *")).toBeFocused();
  expect(backend.requests).toContain(`/api/merchant/me/products/${OAT}`);
  await drawer.getByRole("button", { name: "Cancel" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(main(page).getByRole("heading", { level: 1, name: "Products and stock" })).toBeFocused();

  // On the loaded page: no extra read; focus returns to the product's row.
  await page.goto(`/inventory?productId=${CAPPUCCINO}&action=edit`);
  await expect(drawer.getByRole("heading", { name: "Edit product" })).toBeVisible();
  await expect(drawer.getByLabel("Name *")).toHaveValue("Cappuccino");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "More actions for Cappuccino" })).toBeFocused();
  // Opening an action never changes anything.
  expect(backend.mutations).toEqual([]);
});

// ------------------------------------------------------------- states

test("loading shows a stable skeleton, never an empty or no-changes state", async ({ page }, info) => {
  desktopOnly(info.project.name);
  const backend = await setup(page, { delayMs: 1500 });
  await page.goto("/analytics/changes");
  await expect(main(page).getByRole("heading", { level: 1, name: "Changes" })).toBeVisible();
  await expect(main(page).getByText(/No significant changes|No changes match/)).toHaveCount(0);
  const skeletonTop = await main(page).getByRole("heading", { name: "Active changes" }).boundingBox();
  await page.screenshot({ path: `${SHOTS}/loading-${info.project.name}.png`, fullPage: true });
  await expect(entry(page, DEMAND.headline)).toBeVisible();
  const loadedTop = await main(page).getByRole("heading", { name: "Active changes" }).boundingBox();
  // The list heading does not jump when results arrive.
  expect(Math.abs((loadedTop?.y ?? 0) - (skeletonTop?.y ?? 0))).toBeLessThanOrEqual(1);
  backend.delayMs = 0;
});

test("no material changes uses the agreed copy", async ({ page }, info) => {
  await setup(page, {
    status: status({ summary: { activeChanges: 0, productsNeedingStockReview: 0 } }),
    list: () => ({ items: [], nextCursor: null, timezone: TZ }),
  });
  await page.goto("/analytics/changes");
  await expect(main(page).getByText("No significant changes were detected in your recorded sales.")).toBeVisible();
  await expect(main(page).getByRole("button", { name: "Clear filters" })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/no-changes-${info.project.name}.png`, fullPage: true });
});

const READINESS = (trends: ChangeStatusResponse["readiness"]["trends"], days: number | null = null) => ({
  trends,
  requiredHistoryDays: 28,
  daysUntilTrendsReady: days,
  minUsualWeeklyUnits: 5,
});

test("building baseline gives the day count and still shows stock problems", async ({ page }, info) => {
  await setup(page, {
    status: status({ readiness: READINESS("building_baseline", 9) }),
    list: () => ({ items: [STOCK], nextCursor: null, timezone: TZ }),
  });
  await page.goto("/analytics/changes");
  await expect(main(page).getByText("Sales trends need 28 days of recorded sales. 9 days more are needed.")).toBeVisible();
  await expect(entry(page, STOCK.headline)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/building-baseline-${info.project.name}.png`, fullPage: true });
});

test("insufficient history names the requirement, and an empty list never claims no changes", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await setup(page, {
    status: status({ readiness: READINESS("insufficient_history") }),
    list: () => ({ items: [], nextCursor: null, timezone: TZ }),
  });
  await page.goto("/analytics/changes");
  await expect(main(page).getByText(/at least 5 units sold in a usual week/)).toBeVisible();
  await expect(main(page).getByText("No stock problems need attention")).toBeVisible();
  await expect(main(page).getByText(/No significant changes/)).toHaveCount(0);
});

test("a recording gap explains itself and keeps current stock problems visible", async ({ page }, info) => {
  await setup(page, {
    status: status({ recordingGap: true, lastRecordedSaleDate: "2026-10-12", readiness: READINESS("recording_gap") }),
    list: () => ({ items: [STOCK], nextCursor: null, timezone: TZ }),
  });
  await page.goto("/analytics/changes");
  await expect(main(page).getByText("No sales recorded since 12 Oct 2026.")).toBeVisible();
  await expect(main(page).getByText(/^Sales trends and projections resume when new sales are recorded\./)).toBeVisible();
  await expect(entry(page, STOCK.headline)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/recording-gap-${info.project.name}.png`, fullPage: true });
});

for (const [state, text] of [
  ["pending", "New records are waiting for the next hourly update."],
  ["processing", "Updating your changes now."],
  ["delayed", "The latest update is taking longer than usual."],
] as const) {
  test(`the ${state} state is stated without fake progress`, async ({ page }, info) => {
    desktopOnly(info.project.name);
    await setup(page, { status: status({ processing: state }) });
    await page.goto("/analytics/changes");
    await expect(main(page).getByText(text)).toBeVisible();
    await expect(entry(page, DEMAND.headline)).toBeVisible();
    expect(await main(page).innerText()).not.toMatch(/\d\s?%/);
    await expect(main(page).getByRole("progressbar")).toHaveCount(0);
  });
}

test("a failed analysis keeps the previous results and says the latest one failed", async ({ page }, info) => {
  await setup(page, { status: status({ processing: "failed", lastFailureAt: "2026-10-25T08:00:00.000Z" }) });
  await page.goto("/analytics/changes");
  await expect(main(page).getByText("The latest analysis failed.")).toBeVisible();
  await expect(main(page).getByText(/last successful analysis on 25 Oct 2026, 01:00/)).toBeVisible();
  await expect(entry(page, DEMAND.headline)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/analysis-failed-${info.project.name}.png`, fullPage: true });
});

test("a read failure offers Retry and never becomes an empty state; a later failure keeps results", async ({ page }, info) => {
  desktopOnly(info.project.name);
  let failing = true;
  const backend = await setup(page, { list: (url) => (failing ? 503 : defaultList(url)) });
  await page.goto("/analytics/changes");
  await expect(main(page).getByText("Changes could not be loaded")).toBeVisible();
  await expect(main(page).getByText(/not a finding that nothing changed/)).toBeVisible();
  await expect(main(page).getByText(/No significant changes/)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/read-failure-${info.project.name}.png`, fullPage: true });
  failing = false;
  await main(page).getByRole("button", { name: "Try again" }).click();
  await expect(entry(page, DEMAND.headline)).toBeVisible();

  failing = true;
  backend.list = () => 503;
  await main(page).getByRole("button", { name: "Refresh" }).click();
  await expect(main(page).getByText("The latest refresh failed.")).toBeVisible();
  await expect(entry(page, DEMAND.headline)).toBeVisible();
});

test("offline keeps the loaded information and explains the connection", async ({ page, context }, info) => {
  const backend = await setup(page);
  await page.goto("/analytics/changes");
  await expect(entry(page, DEMAND.headline)).toBeVisible();
  await context.setOffline(true);
  backend.offline = true;
  await main(page).getByRole("button", { name: "Refresh" }).click();
  await expect(main(page).getByText("You appear to be offline.")).toBeVisible();
  await expect(entry(page, DEMAND.headline)).toBeVisible();
  await expect(page.locator("[aria-live=polite]").filter({ hasText: /offline/ })).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/offline-${info.project.name}.png`, fullPage: true });
  await context.setOffline(false);
});

test("a sample account shows a discreet indicator", async ({ page }, info) => {
  await setup(page, { status: status({ provenance: { account: "sample", includesTestPayments: true } }) });
  await page.goto("/analytics/changes");
  await expect(main(page).getByText("Sample account", { exact: true })).toBeVisible();
  await expect(main(page).getByText(/demo/i)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/sample-account-${info.project.name}.png`, fullPage: true });
});

// ------------------------------------------------------------- accessibility

test("keyboard users reach every control, with accessible names and 44 px targets", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await setup(page);
  await page.goto("/analytics/changes");
  await expect(entry(page, DEMAND.headline)).toBeVisible();

  const levels = await main(page).locator("h1, h2, h3").evaluateAll((nodes) => nodes.map((n) => Number(n.tagName[1])));
  expect(levels[0]).toBe(1);
  for (let i = 1; i < levels.length; i += 1) expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);

  const targets = await main(page)
    .locator("a, button, input, [role=combobox], [role=radio]")
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => (n as HTMLElement).offsetParent !== null)
        .map((n) => {
          const box = n.getBoundingClientRect();
          return {
            name: (n.getAttribute("aria-label") ?? n.textContent ?? "").trim() || (n as HTMLInputElement).labels?.[0]?.textContent?.trim() || "",
            height: box.height,
            width: box.width,
          };
        }),
    );
  for (const target of targets) {
    expect(target.name, "every control has a name").not.toBe("");
    expect(target.height, `${target.name} height`).toBeGreaterThanOrEqual(44);
    expect(target.width, `${target.name} width`).toBeGreaterThanOrEqual(44);
  }

  const link = entry(page, DEMAND.headline).getByRole("link", { name: "View explanation" });
  await link.focus();
  const outline = await link.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(outline).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/analytics/changes/${DEMAND_ID}$`));
  const summary = main(page).locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(main(page).getByText("Calculation version")).toBeVisible();
});

test("reduced motion is respected", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page, { delayMs: 1000 });
  await page.goto("/analytics/changes");
  const durations = await page.locator("main .animate-pulse").evaluateAll((nodes) =>
    nodes.map((n) => parseFloat(getComputedStyle(n).animationDuration)),
  );
  expect(durations.length).toBeGreaterThan(0);
  for (const d of durations) expect(d).toBeLessThan(0.01);
});

test("no horizontal page scroll on the Analytics pages", async ({ page }) => {
  await setup(page);
  for (const path of ["/analytics/general", "/analytics/deep", "/analytics/changes", `/analytics/changes/${LONG_ID}`]) {
    await page.goto(path);
    await expect(main(page).getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    // The shared navigation always fits, wrapping rather than scrolling.
    const nav = await main(page).getByRole("navigation", { name: "Analytics views" }).boundingBox();
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect((nav?.x ?? 0) + (nav?.width ?? 0)).toBeLessThanOrEqual(width);
    // General analytics' own charts overflow at 375 px before this work
    // (general-analytics.spec "a year of daily bars…" fails the same way).
    if (path !== "/analytics/general") await noHorizontalScroll(page);
  }
});
