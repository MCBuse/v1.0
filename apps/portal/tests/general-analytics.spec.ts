import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: "mcbuse_portal_access",
      value: "test-only",
      url: "http://127.0.0.1:3101",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});

/**
 * T.15 and V.9 in a browser, against the mock API's General Analytics payload.
 * Transactions is the default tab; inventory and combined content is reached
 * through `?tab=` exactly as a merchant's link or tab click would.
 */
test("T.15 — every chart can be read as numbers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general");

  const seriesChart = page.getByRole("img", {
    name: "Recorded sales by day",
  });
  await expect(seriesChart).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Sales by hour of day" }),
  ).toBeVisible();

  // The accessible table exists whether or not it is shown.
  await expect(
    page.getByRole("table", { name: "Recorded sales by day" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("table", { name: "Sales by hour of day" }),
  ).toHaveCount(1);
});

test("T.15 — the numbers behind a chart can be revealed", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general");
  // Held by what it controls: the label flips to "Hide the numbers" on click.
  const toggle = page.locator(
    'button[aria-controls="chart-table-recorded-sales-by-day"]',
  );
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const revealed = page.locator("#chart-table-recorded-sales-by-day");
  await expect(revealed.getByText("€180.00")).toBeVisible();
  await expect(revealed.getByText("Still running")).toBeVisible();
});

test("T.13 — a running period is labelled rather than presented as final", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general");
  await expect(page.getByText("Partial reporting periods")).toBeVisible();
  await expect(
    page.getByText("will continue to change", { exact: false }),
  ).toBeVisible();
});

test("T.6 and T.9 — the cash and digital split and the trading windows", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general");
  // Scoped: "Cash" is also a filter button above.
  const transactions = page.getByRole("tabpanel", { name: "Transaction analytics" });
  await expect(transactions.getByText("Digital sales", { exact: true })).toBeVisible();
  await expect(transactions.getByText("Cash sales", { exact: true })).toBeVisible();
  const peak = page.getByText("Peak hour").locator("..");
  await expect(peak).toBeVisible();
  await expect(peak.getByText("12:00")).toBeVisible();
  const window = transactions.getByText("Busiest three hours", { exact: true });
  await expect(window).toBeVisible();
  await expect(window.locator("..").getByText("11:00–14:00")).toBeVisible();
});

test("V.9 — the product table sorts", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general?tab=inventory");
  const table = page.getByRole("table", { name: "Product performance" });
  // Default: most units per day first.
  await expect(table.getByRole("row").nth(1)).toContainText("Product 00");

  await table.getByRole("button", { name: "Units sold" }).click();
  await expect(
    table.getByRole("columnheader", { name: "Units sold" }),
  ).toHaveAttribute("aria-sort", "descending");
  await table.getByRole("button", { name: "Units sold" }).click();
  await expect(
    table.getByRole("columnheader", { name: "Units sold" }),
  ).toHaveAttribute("aria-sort", "ascending");
  // Ascending by units sold puts the lowest seller first.
  await expect(table.getByRole("row").nth(1)).toContainText("Product 13");
});

test("V.9 — the product table pages", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general?tab=inventory");
  const products = page
    .getByRole("table", { name: "Product performance" })
    .locator("..")
    .locator("..");
  await expect(products.getByText("Showing 1–10 of 14")).toBeVisible();
  await products.getByRole("button", { name: "Next" }).click();
  await expect(products.getByText("Showing 11–14 of 14")).toBeVisible();
  await expect(products.getByText("Page 2 of 2")).toBeVisible();
  await expect(products.getByRole("button", { name: "Next" })).toBeDisabled();
});

test("V.12 — a category says whether its label was recorded at the sale", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general?tab=inventory");
  const table = page.getByRole("table", { name: "Sales by category" });
  await expect(table.getByText("recorded at sale")).toBeVisible();
  await expect(table.getByText("current product")).toBeVisible();
});

test("V.7 — the stock-out history distinguishes intervals from unknowns", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general?tab=inventory");
  await expect(page.getByText("2026-09-18 – 2026-09-21")).toBeVisible();
  await expect(page.getByText("ongoing", { exact: false }).first()).toBeVisible();
  await expect(
    page.getByText("Opening stock for this period cannot be established", {
      exact: false,
    }).first(),
  ).toBeVisible();
});

test("V.8 — turnover says why it is unavailable rather than showing a blank", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general?tab=inventory");
  const table = page.getByRole("table", { name: "Inventory turnover" });
  await expect(table.getByText("Not available")).toBeVisible();
  await expect(table.getByText("2.35×")).toBeVisible();
});

test("V.2 — stock value is never presented as cost or profit", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general?tab=inventory");
  await expect(
    page.getByText("This is not purchase cost", { exact: false }),
  ).toBeVisible();
});

test("C.1–C.8 — all four combined readings appear with their scope note", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general?tab=combined");
  for (const title of [
    "Sales against stock",
    "Trading concentration",
    "Volume against value",
    "Selling speed against availability",
  ]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  await expect(
    page.getByText("Stock figures cover all stock", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("not by a model", { exact: false }),
  ).toBeVisible();
});

test("a failed analytics read says so rather than rendering empty charts", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.route("**/api/merchant/me/analytics/general**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "General Analytics is temporarily unavailable" }),
    }),
  );

  await page.goto("/analytics/general");
  await expect(page.getByText("Analytics could not be loaded.")).toBeVisible();
  await expect(
    page.getByText("General Analytics is temporarily unavailable"),
  ).toBeVisible();
});

test("changing the period asks the API for that period", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  const requested: string[] = [];
  await page.route("**/api/merchant/me/analytics/general**", (route) => {
    requested.push(new URL(route.request().url()).search);
    return route.fallback();
  });

  await page.goto("/analytics/general");
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  await page.getByRole("radio", { name: "Today", exact: true }).click();
  await expect
    .poll(() => requested.some((search) => search.includes("period=today")))
    .toBe(true);
  await page.getByRole("combobox", { name: /Group by/ }).click();
  await page.getByRole("option", { name: "Weekly" }).click();
  await expect
    .poll(() => requested.some((search) => search.includes("grouping=week")))
    .toBe(true);
});

test("the three sections are real tabs and only the selected one is shown", async ({
  page,
}) => {
  await page.goto("/analytics/general");
  const tablist = page.getByRole("tablist", { name: "General analytics" });
  const tabs = tablist.getByRole("tab");
  await expect(tabs).toHaveText([
    "Transaction analytics",
    "Inventory analytics",
    "Combined analytics",
  ]);
  const transactions = tablist.getByRole("tab", { name: "Transaction analytics" });
  const inventory = tablist.getByRole("tab", { name: "Inventory analytics" });
  const combined = tablist.getByRole("tab", { name: "Combined analytics" });
  await expect(transactions).toHaveAttribute("aria-selected", "true");
  await expect(inventory).toHaveAttribute("aria-selected", "false");
  await expect(combined).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await expect(
    page.getByRole("tabpanel", { name: "Transaction analytics" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Recorded sales by day" }),
  ).toBeVisible();

  await inventory.click();
  await expect(page).toHaveURL(/[?&]tab=inventory(&|$)/);
  await expect(inventory).toHaveAttribute("aria-selected", "true");
  await expect(transactions).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  const panel = page.getByRole("tabpanel", { name: "Inventory analytics" });
  await expect(
    panel.getByRole("table", { name: "Product performance" }),
  ).toHaveCount(1);
  // The transaction content is gone, not merely scrolled past.
  await expect(
    page.getByRole("img", { name: "Recorded sales by day" }),
  ).toHaveCount(0);

  await combined.click();
  await expect(page).toHaveURL(/[?&]tab=combined(&|$)/);
  await expect(
    page.getByRole("tabpanel", { name: "Combined analytics" }),
  ).toBeVisible();

  // The default tab keeps a clean address.
  await transactions.click();
  await expect(transactions).toHaveAttribute("aria-selected", "true");
  await expect(page).not.toHaveURL(/tab=/);
});

test("the arrow, Home and End keys move between tabs", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general");
  const transactions = page.getByRole("tab", { name: "Transaction analytics" });
  const inventory = page.getByRole("tab", { name: "Inventory analytics" });
  const combined = page.getByRole("tab", { name: "Combined analytics" });
  // Roving tabindex: only the selected tab is in the Tab order.
  await expect(transactions).toHaveAttribute("tabindex", "0");
  await expect(inventory).toHaveAttribute("tabindex", "-1");

  await transactions.focus();
  await page.keyboard.press("ArrowRight");
  await expect(inventory).toBeFocused();
  await expect(inventory).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/[?&]tab=inventory(&|$)/);

  await page.keyboard.press("End");
  await expect(combined).toBeFocused();
  await expect(combined).toHaveAttribute("aria-selected", "true");

  // Wraps from the last tab to the first.
  await page.keyboard.press("ArrowRight");
  await expect(transactions).toBeFocused();
  await expect(transactions).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ArrowLeft");
  await expect(combined).toBeFocused();

  await page.keyboard.press("Home");
  await expect(transactions).toBeFocused();
  await expect(transactions).toHaveAttribute("aria-selected", "true");
});

test("?tab=inventory opens the inventory tab directly", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general?tab=inventory");
  await expect(
    page.getByRole("tab", { name: "Inventory analytics" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page
      .getByRole("tabpanel", { name: "Inventory analytics" })
      .getByRole("table", { name: "Product performance" }),
  ).toHaveCount(1);
});

test("an unknown tab falls back to transactions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general?tab=nonsense");
  await expect(
    page.getByRole("tab", { name: "Transaction analytics" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("tabpanel", { name: "Transaction analytics" }),
  ).toBeVisible();
});

test("an old #combined-analytics link opens the combined tab", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general#combined-analytics");
  await expect(
    page.getByRole("tab", { name: "Combined analytics" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/[?&]tab=combined(&|$)/);
  await expect(page).not.toHaveURL(/#combined-analytics/);
  await expect(
    page.getByRole("heading", { name: "Sales against stock" }),
  ).toBeVisible();
});

test("the chosen period is kept when switching tabs", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  const requested: string[] = [];
  await page.route("**/api/merchant/me/analytics/general**", (route) => {
    requested.push(new URL(route.request().url()).search);
    return route.fallback();
  });

  await page.goto("/analytics/general");
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  const today = page.getByRole("radio", { name: "Today", exact: true });
  await today.click();
  await expect
    .poll(() => requested.some((search) => search.includes("period=today")))
    .toBe(true);
  const beforeSwitch = requested.length;

  await page.getByRole("tab", { name: "Inventory analytics" }).click();
  await expect(page).toHaveURL(/[?&]tab=inventory(&|$)/);
  await expect(
    page.getByRole("table", { name: "Product performance" }),
  ).toHaveCount(1);
  await expect(today).toHaveAttribute("aria-checked", "true");
  // Anything read after the switch is still for today, never the default 30d.
  expect(
    requested.slice(beforeSwitch).every((search) => search.includes("period=today")),
  ).toBe(true);
});

test("the source facet narrows the request, shows its value, and Reset clears every filter", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");
  const requested: string[] = [];
  await page.route("**/api/merchant/me/analytics/general**", (route) => {
    requested.push(new URL(route.request().url()).search);
    return route.fallback();
  });

  await page.goto("/analytics/general");
  const filters = page.getByRole("group", { name: "Analytics filters" });
  // Every record is always included: there is no records/environment filter.
  await expect(filters.getByText("Records", { exact: true })).toHaveCount(0);
  await expect(filters.getByRole("radio", { name: "Live" })).toHaveCount(0);
  await expect(filters.getByRole("button", { name: "Reset" })).toHaveCount(0);

  await filters.getByRole("button", { name: "Source" }).click();
  await page.getByRole("menuitemradio", { name: "Cash" }).click();
  await expect
    .poll(() => requested.some((search) => search.includes("source=merchant_cash")))
    .toBe(true);
  await expect(filters.getByRole("button", { name: /Source.*Cash/ })).toBeVisible();

  await filters.getByRole("radio", { name: "90d" }).click();
  await filters.getByRole("button", { name: "Reset" }).click();
  await expect(filters.getByRole("radio", { name: "30d" })).toHaveAttribute("aria-checked", "true");
  await expect(filters.getByRole("button", { name: "Source", exact: true })).toBeVisible();
  await expect(filters.getByRole("button", { name: "Reset" })).toHaveCount(0);
  expect(requested.every((search) => !search.includes("environment="))).toBe(true);
});

test("a year of daily bars never pushes the page sideways", async ({ page }) => {
  // 365 daily bars once needed ~2,200px of fixed gaps and widened the page.
  await page.route("**/api/merchant/me/analytics/general**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const start = Date.UTC(2025, 8, 27);
    body.transactions.series = Array.from({ length: 365 }, (_, day) => {
      const at = new Date(start + day * 86_400_000).toISOString();
      return {
        periodStart: at,
        periodEnd: at,
        label: at.slice(0, 10),
        amountMinor: String(500 + (day % 17) * 90),
        count: 1 + (day % 5),
        averageMinor: "500",
        partial: false,
      };
    });
    await route.fulfill({ response, json: body });
  });

  await page.goto("/analytics/general");
  await expect(
    page.getByRole("img", { name: /Recorded sales by/ }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
