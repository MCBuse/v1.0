import { expect, type Page, test } from "@playwright/test";

const productId = "00000000-0000-4000-8000-000000000101";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  unitPrice: {
    minor: string;
    currency: "EUR";
    estimated: false;
    rateTimestamp: null;
  };
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  lowStockThreshold: number;
  lowStock: boolean;
  imageUrl: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: productId,
    name: "Coffee Candy",
    sku: "COF-01",
    description: null,
    unitPrice: {
      minor: "200",
      currency: "EUR",
      estimated: false,
      rateTimestamp: null,
    },
    onHandQuantity: 100,
    reservedQuantity: 0,
    availableQuantity: 100,
    lowStockThreshold: 5,
    lowStock: false,
    imageUrl: null,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

async function signIn(page: Page) {
  await page.context().addCookies([
    {
      name: "mcbuse_portal_access",
      value: "test-only",
      url: "http://127.0.0.1:3101",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function mockInventory(page: Page, initial: Product[] = []) {
  const products = [...initial];
  let failNextCreate = false;

  await page.route("**/api/merchant/me/products**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === "GET") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: products,
          page: 1,
          pageSize: 100,
          totalItems: products.length,
          totalPages: 1,
        }),
      });
    }

    if (method === "POST" && url.pathname.endsWith("/me/products")) {
      if (failNextCreate) {
        failNextCreate = false;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Product service unavailable" }),
        });
      }

      const body = request.postDataJSON() as {
        name: string;
        sku?: string;
        description?: string;
        unitPriceMinor: string;
        quantity: number;
        lowStockThreshold: number;
      };
      const created = makeProduct({
        name: body.name,
        sku: body.sku ?? null,
        description: body.description ?? null,
        unitPrice: {
          minor: body.unitPriceMinor,
          currency: "EUR",
          estimated: false,
          rateTimestamp: null,
        },
        onHandQuantity: body.quantity,
        availableQuantity: body.quantity,
        lowStockThreshold: body.lowStockThreshold,
      });
      products.push(created);
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(created),
      });
    }

    const product = products[0];
    if (!product) return route.abort();

    if (method === "PATCH" && url.pathname.endsWith(`/${product.id}`)) {
      const body = request.postDataJSON() as Partial<{
        name: string;
        sku: string;
        description: string;
        unitPriceMinor: string;
        lowStockThreshold: number;
        status: Product["status"];
      }> & { quantity?: unknown };
      if ("quantity" in body) {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: ["property quantity should not exist"] }),
        });
      }
      Object.assign(product, {
        name: body.name ?? product.name,
        sku: body.sku ?? product.sku,
        description: body.description ?? product.description,
        lowStockThreshold: body.lowStockThreshold ?? product.lowStockThreshold,
        status: body.status ?? product.status,
        unitPrice: body.unitPriceMinor
          ? { ...product.unitPrice, minor: body.unitPriceMinor }
          : product.unitPrice,
      });
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(product),
      });
    }

    if (
      method === "POST" &&
      url.pathname.endsWith(`/${product.id}/stock-adjustments`)
    ) {
      const { change } = request.postDataJSON() as { change: number };
      product.onHandQuantity += change;
      product.availableQuantity += change;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(product),
      });
    }

    return route.abort();
  });

  return {
    failCreateOnce() {
      failNextCreate = true;
    },
  };
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("uses one Add product trigger and resets an abandoned draft", async ({
  page,
}) => {
  await mockInventory(page);
  await page.goto("/inventory");

  const trigger = page.getByRole("button", { name: "Add product" });
  await expect(trigger).toHaveCount(1);
  await expect(page.getByText("No products yet")).toBeVisible();

  await trigger.click();
  let drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Save product" }),
  ).toHaveCount(1);
  await drawer.getByLabel("Name *").fill("Unsaved product");
  await drawer.getByRole("button", { name: "Close product drawer" }).click();
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  drawer = page.getByRole("dialog");
  await expect(drawer.getByLabel("Name *")).toHaveValue("");
});

test("validates and creates a product from the drawer", async ({ page }) => {
  await mockInventory(page);
  await page.goto("/inventory");

  await page.getByRole("button", { name: "Add product" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Save product" }).click();
  await expect(drawer.getByText("Enter a product name.")).toBeVisible();
  await expect(drawer.getByLabel("Name *")).toBeFocused();

  await drawer.getByLabel("Name *").fill("Tea Biscuits");
  await drawer.getByLabel("Unit price *").fill("3.25");
  await drawer.getByLabel("On hand *").fill("12");
  await drawer.getByRole("button", { name: "Save product" }).click();

  await expect(drawer).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Tea Biscuits" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add product" })).toHaveCount(
    1,
  );
});

test("preserves product values after a server error", async ({ page }) => {
  const inventory = await mockInventory(page);
  inventory.failCreateOnce();
  await page.goto("/inventory");

  await page.getByRole("button", { name: "Add product" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByLabel("Name *").fill("Plantain Chips");
  await drawer.getByLabel("Unit price *").fill("1.50");
  await drawer.getByRole("button", { name: "Save product" }).click();

  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Product service unavailable")).toBeVisible();
  await expect(drawer.getByLabel("Name *")).toHaveValue("Plantain Chips");
  await expect(drawer.getByLabel("Unit price *")).toHaveValue("1.50");
});

test("edits a product in the same drawer", async ({ page }) => {
  await mockInventory(page, [makeProduct()]);
  await page.goto("/inventory");

  await page.getByRole("button", { name: "Edit" }).click();
  const drawer = page.getByRole("dialog");
  await expect(
    drawer.getByRole("heading", { name: "Edit product" }),
  ).toBeVisible();
  await expect(drawer.getByLabel("Name *")).toHaveValue("Coffee Candy");
  await drawer.getByLabel("Name *").fill("Coffee Toffee");
  await drawer.getByLabel("On hand *").fill("102");
  await drawer.getByRole("button", { name: "Save changes" }).click();

  await expect(drawer).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Coffee Toffee" }),
  ).toBeVisible();
  await expect(page.getByText("102 on hand · 0 reserved")).toBeVisible();
});

test("keeps Inventory in main navigation and shares its analytics with Analytics", async ({ page }, testInfo) => {
  await mockInventory(page, [makeProduct()]);
  const money = { minor: "2000", currency: "EUR", estimated: false, rateTimestamp: null };
  const requests: string[] = [];
  await page.route("**/api/merchant/me/analytics?*", (route) => {
    requests.push(route.request().url());
    return route.fulfill({ json: {
      period: { from: "2026-09-01T00:00:00Z", to: "2026-09-19T00:00:00Z", timezone: "UTC", partialCurrentDay: true },
      generatedAt: "2026-09-19T00:00:00Z",
      totalRecordedSales: money, saleCount: 10, averageSale: money,
      comparisons: { salesPercent: 10, transactionCountPercent: 10, averageSalePercent: 0 },
      digitalSales: money, cashSales: money,
      sourceCoverage: { mcbuse_payment: 10, merchant_cash: 0 },
      dailyTrend: [], hourlyRhythm: [],
      productPerformance: [{ productId, name: "Coffee Candy", category: "Sweets", quantitySold: 10, totalSales: money, quantityChangePercent: 25, turnoverStatus: "available", turnover: 0.5 }],
      categoryPerformance: [{ category: "Sweets", quantitySold: 10, totalSales: money, quantityChangePercent: 25 }],
      inventory: { stockValueAtSellingPrices: money, availableValueAtSellingPrices: money, reservedValueAtSellingPrices: money, lowStockProductCount: 2, zeroStockProductCount: 1 },
      unassignedItems: [{ name: "Unassigned sweet", quantitySold: 1, totalSales: money }],
    } });
  });
  await page.route("**/api/merchant/me/insights", (route) => route.fulfill({ json: {
    status: "ready", generatedAt: "2026-09-19T00:00:00Z", stale: false,
    scope: { periodFrom: "2026-09-01T00:00:00Z", periodTo: "2026-09-19T00:00:00Z" },
    insights: [
      { id: "stock", kind: "stock_risk", title: "Restock Coffee Candy", summary: "Stock is running low.", recommendation: null, evidence: [], limitations: [], narrationSource: "deterministic" },
      { id: "discrepancy", kind: "discrepancy", title: "Stock movement mismatch", summary: "Review recorded movements.", recommendation: null, evidence: [{ id: `product:${productId}`, label: "Coffee Candy", value: "100 units" }], limitations: [], narrationSource: "deterministic" },
      { id: "anomaly", kind: "anomaly", title: "Unusual product sales", summary: "Review product demand.", recommendation: null, evidence: [{ id: `product:${productId}`, label: "Coffee Candy", value: "10 units" }], limitations: [], narrationSource: "deterministic" },
      { id: "sales", kind: "performance", title: "Sales increased", summary: "Sales are up.", recommendation: null, evidence: [], limitations: [], narrationSource: "deterministic" },
    ],
  } }));

  await page.goto("/overview");
  const nav = page.getByRole("navigation", { name: testInfo.project.name === "desktop" ? "Primary" : "Mobile", exact: true });
  const inventoryLink = nav.getByRole("link", { name: "Inventory", exact: true });
  await expect(inventoryLink).toBeVisible();
  await inventoryLink.click();
  await expect(page).toHaveURL("/inventory");
  await expect(inventoryLink).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Analytics", exact: true })).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Add product" })).toBeVisible();
  const section = page.getByRole("region", { name: "Inventory analytics", exact: true });
  const headings = ["Best-selling products", "Slow-moving products", "Inventory value", "Category performance", "Unassigned items"];
  for (const heading of headings) await expect(section.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  await expect(section.getByText("Low-stock products", { exact: true })).toBeVisible();
  await expect(section.getByText("Out-of-stock products", { exact: true })).toBeVisible();
  await expect(section.getByRole("heading", { name: "Restock Coffee Candy" })).toBeVisible();
  await expect(section.getByRole("heading", { name: "Sales increased" })).toHaveCount(0);
  await expect(section.getByRole("heading", { name: "Stock movement mismatch" })).toBeVisible();
  await expect(section.getByRole("heading", { name: "Unusual product sales" })).toBeVisible();
  await section.getByRole("button", { name: "7 days", exact: true }).click();
  await expect.poll(() => requests.some((url) => url.endsWith("period=7d"))).toBe(true);
  await section.getByLabel("Source", { exact: true }).selectOption("merchant_cash");
  await expect.poll(() => requests.some((url) => url.includes("period=7d&source=merchant_cash"))).toBe(true);
  await page.screenshot({ path: `/tmp/mcbuse-inventory-${testInfo.project.name}.png`, fullPage: true });

  await nav.getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(page).toHaveURL("/analytics");
  for (const heading of headings) await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sales increased" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Restock Coffee Candy" })).toBeVisible();
});

test("keeps product management available when inventory analytics fails", async ({ page }) => {
  await mockInventory(page, [makeProduct()]);
  await page.route("**/api/merchant/me/analytics?*", (route) => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.goto("/inventory");
  await expect(page.getByText("Inventory analytics could not load. You can still manage your products above.")).toBeVisible();
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByRole("dialog").getByLabel("Name *")).toBeVisible();
});
