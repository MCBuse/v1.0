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
  await expect(page.getByText("Latest period still running")).toBeVisible();
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
  const transactions = page.getByRole("region", { name: "Transaction analytics" });
  await expect(transactions.getByText("Digital", { exact: true })).toBeVisible();
  await expect(transactions.getByText("Cash", { exact: true })).toBeVisible();
  const peak = page.getByText("Peak hour").locator("..");
  await expect(peak).toBeVisible();
  await expect(peak.getByText("12:00")).toBeVisible();
  const window = transactions.getByText("Busiest three hours", { exact: true });
  await expect(window).toBeVisible();
  await expect(window.locator("..").getByText("11:00–14:00")).toBeVisible();
});

test("V.9 — the product table sorts", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general");
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

  await page.goto("/analytics/general");
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

  await page.goto("/analytics/general");
  const table = page.getByRole("table", { name: "Sales by category" });
  await expect(table.getByText("recorded at sale")).toBeVisible();
  await expect(table.getByText("current product")).toBeVisible();
});

test("V.7 — the stock-out history distinguishes intervals from unknowns", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general");
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

  await page.goto("/analytics/general");
  const table = page.getByRole("table", { name: "Inventory turnover" });
  await expect(table.getByText("Not available")).toBeVisible();
  await expect(table.getByText("2.3529")).toBeVisible();
});

test("V.2 — stock value is never presented as cost or profit", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general");
  await expect(
    page.getByText("This is not purchase cost", { exact: false }),
  ).toBeVisible();
});

test("C.1–C.8 — all four combined readings appear with their scope note", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/analytics/general");
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
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect
    .poll(() => requested.some((search) => search.includes("period=today")))
    .toBe(true);
  await page.getByRole("button", { name: "week", exact: true }).click();
  await expect
    .poll(() => requested.some((search) => search.includes("grouping=week")))
    .toBe(true);
});
