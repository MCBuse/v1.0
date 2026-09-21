import { expect, test } from "@playwright/test";

function receipt(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `txn-${index}`,
    receiptNumber: `MCB-TEST${index}`,
    amount: {
      minor: "1850",
      currency: "EUR",
      estimated: false,
      rateTimestamp: null,
    },
    description: index === 0 ? "Morning rush" : `Sale ${index}`,
    status: "received",
    receivedAt: "2026-09-21T09:00:00.000Z",
    settlement: {
      amount: "20000000",
      currency: "USDC",
      quoteRateScaled: "920000000",
    },
    fees: {
      merchantFeeMinor: "0",
      networkFeePaidBy: "treasury",
      note: "No merchant fee was charged. The network fee was paid by MCBuse, not deducted from this sale.",
    },
    netAmount: {
      minor: "1850",
      currency: "EUR",
      estimated: false,
      rateTimestamp: null,
    },
    stockImpact: { unitsSold: 2, lines: 1, note: null },
    reconciliation: {
      state: "no_source_records",
      reference: null,
      note: "No settlement records have been imported, so there is nothing to reconcile against.",
    },
    environment: "test",
    ...overrides,
  };
}

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
  await page.route("**/api/merchant/me/activity**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 1,
      }),
    }),
  );
});

test("Q.13 — receipts are listed with their reconciliation state", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.route("**/api/merchant/me/transactions**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [receipt(0), receipt(1)],
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
      }),
    }),
  );

  await page.goto("/analytics/transactions");
  const history = page.getByRole("region", { name: "Receipt history" });
  await expect(history.getByText("MCB-TEST0")).toBeVisible();
  await expect(history.getByText("Morning rush")).toBeVisible();
  await expect(history.getByText("No source records").first()).toBeVisible();
});

test("Q.13 — the financial attributes are one click away", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.route("**/api/merchant/me/transactions**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [receipt(0)],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      }),
    }),
  );

  await page.goto("/analytics/transactions");
  const history = page.getByRole("region", { name: "Receipt history" });
  await history
    .getByRole("button", { name: "Show financial detail for MCB-TEST0" })
    .click();

  await expect(history.getByText("20000000 USDC")).toBeVisible();
  await expect(
    history.getByText("not deducted from this sale", { exact: false }),
  ).toBeVisible();
  await expect(history.getByText("2 units across 1 line")).toBeVisible();
  await expect(
    history.getByText("nothing to reconcile against", { exact: false }),
  ).toBeVisible();
  await expect(history.getByText("test", { exact: true })).toBeVisible();
});

test("Q.13 — a matched receipt names the settlement record", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.route("**/api/merchant/me/transactions**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          receipt(0, {
            reconciliation: {
              state: "matched",
              reference: "PSP-REF-1",
              note: "An imported settlement record references this sale.",
            },
          }),
        ],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      }),
    }),
  );

  await page.goto("/analytics/transactions");
  const history = page.getByRole("region", { name: "Receipt history" });
  await expect(history.getByText("Matched")).toBeVisible();
  await history
    .getByRole("button", { name: "Show financial detail for MCB-TEST0" })
    .click();
  await expect(history.getByText("(PSP-REF-1)", { exact: false })).toBeVisible();
});

test("Q.13 — searching asks the API for the term", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  const searches: string[] = [];
  await page.route("**/api/merchant/me/transactions**", (route) => {
    searches.push(new URL(route.request().url()).search);
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [receipt(0)],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      }),
    });
  });

  await page.goto("/analytics/transactions");
  const history = page.getByRole("region", { name: "Receipt history" });
  await history.getByLabel("Search receipts").fill("Morning");
  await history.getByRole("button", { name: "Search" }).click();

  await expect
    .poll(() => searches.some((search) => search.includes("query=Morning")))
    .toBe(true);
});

test("Q.13 — a search with no match says so rather than showing an empty table", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.route("**/api/merchant/me/transactions**", (route) => {
    const search = new URL(route.request().url()).search;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: search.includes("query=") ? [] : [receipt(0)],
        page: 1,
        pageSize: 20,
        totalItems: search.includes("query=") ? 0 : 1,
        totalPages: 1,
      }),
    });
  });

  await page.goto("/analytics/transactions");
  const history = page.getByRole("region", { name: "Receipt history" });
  await history.getByLabel("Search receipts").fill("nothing-matches-this");
  await history.getByRole("button", { name: "Search" }).click();
  await expect(
    history.getByText("No receipt matches", { exact: false }),
  ).toBeVisible();
});

test("Q.13 — the history pages", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.route("**/api/merchant/me/transactions**", (route) => {
    const requested = Number(
      new URL(route.request().url()).searchParams.get("page") ?? 1,
    );
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [receipt(requested)],
        page: requested,
        pageSize: 20,
        totalItems: 40,
        totalPages: 2,
      }),
    });
  });

  await page.goto("/analytics/transactions");
  const history = page.getByRole("region", { name: "Receipt history" });
  await expect(history.getByText("Page 1 of 2")).toBeVisible();
  await expect(
    history.getByRole("button", { name: "Previous" }),
  ).toBeDisabled();
  await history.getByRole("button", { name: "Next" }).click();
  await expect(history.getByText("Page 2 of 2")).toBeVisible();
  await expect(history.getByRole("button", { name: "Next" })).toBeDisabled();
});
