import { expect, test } from "@playwright/test";

const PRODUCTS = {
  items: [
    {
      id: "00000000-0000-4000-8000-00000000p001".replace("p", "0"),
      name: "Flat white",
      category: "Hot Drinks",
      sku: "FW-1",
      description: null,
      unitPrice: {
        minor: "350",
        currency: "EUR",
        estimated: false,
        rateTimestamp: null,
      },
      onHandQuantity: 20,
      reservedQuantity: 0,
      availableQuantity: 20,
      lowStockThreshold: 5,
      lowStock: false,
      imageUrl: null,
      status: "active",
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Sold out beans",
      category: "Retail",
      sku: "SB-1",
      description: null,
      unitPrice: {
        minor: "900",
        currency: "EUR",
        estimated: false,
        rateTimestamp: null,
      },
      onHandQuantity: 0,
      reservedQuantity: 0,
      availableQuantity: 0,
      lowStockThreshold: 2,
      lowStock: true,
      imageUrl: null,
      status: "active",
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
    },
  ],
  page: 1,
  pageSize: 100,
  totalItems: 2,
  totalPages: 1,
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
  await page.route("**/api/merchant/me/products**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(PRODUCTS),
    }),
  );
  await page.route("**/api/merchant/me/insights**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "disabled",
        calculationVersion: "merchant-intelligence-v1",
        generatedAt: null,
        stale: false,
        snapshot: null,
        scope: {
          label: "all_recorded_activity",
          periodFrom: null,
          periodTo: null,
          mixedData: false,
          sourceCoverage: {},
        },
        insights: [],
        message: null,
        freshness: {
          generatedAt: null,
          ageSeconds: null,
          stale: false,
          staleAfterMinutes: 375,
        },
        lastFailure: null,
      }),
    }),
  );
  await page.route("**/api/merchant/me/analytics/general**", (route) =>
    route.fulfill({ status: 404, body: JSON.stringify({ message: "Not found" }) }),
  );
});

/** Q.1 — the catalogue is a starting point for a sale, not just a list. */
test("Q.1 — a product opens the itemised invoice flow already loaded", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/inventory");
  await page
    .getByRole("button", { name: "Create invoice or QR for Flat white" })
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Straight into the itemised flow, with the product already a line.
  await expect(dialog.getByRole("combobox", { name: "Product" })).toHaveValue(
    PRODUCTS.items[0]!.id,
  );
  await expect(dialog.getByText("Invoice total")).toBeVisible();
  // The option list also mentions the price, so the total is read from its own
  // element rather than by text alone.
  await expect(
    dialog.getByText("Invoice total").locator("..").getByText("€3.50"),
  ).toBeVisible();
});

test("Q.1 — the preloaded line can be adjusted before creating", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/inventory");
  await page
    .getByRole("button", { name: "Create invoice or QR for Flat white" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Increase quantity" }).click();
  await expect(
    dialog.getByText("Invoice total").locator("..").getByText("€7.00"),
  ).toBeVisible();
});

test("Q.1 — the invoice it creates carries the product line", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  const bodies: unknown[] = [];
  await page.route("**/api/merchant/me/invoices", (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? "{}"));
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "invoice-1",
        invoiceNumber: "INV-Q1",
        description: null,
        lines: [],
        amount: {
          minor: "350",
          currency: "EUR",
          estimated: false,
          rateTimestamp: null,
        },
        status: "pending",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        qrPayload: "mcbuse://pay/q1",
        completedAt: null,
        createdAt: new Date().toISOString(),
      }),
    });
  });

  await page.goto("/inventory");
  await page
    .getByRole("button", { name: "Create invoice or QR for Flat white" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Create itemised request" }).click();

  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toMatchObject({
    lines: [{ type: "product", productId: PRODUCTS.items[0]!.id, quantity: 1 }],
  });
  await expect(page.getByLabel("Payment request QR code")).toBeVisible();
});

test("Q.1 — a product with no available stock cannot start an invoice", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/inventory");
  await expect(
    page.getByRole("button", {
      name: "Create invoice or QR for Sold out beans",
    }),
  ).toBeDisabled();
});
