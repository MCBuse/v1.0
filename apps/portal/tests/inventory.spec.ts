import { expect, type Page, test } from "@playwright/test";

const productId = "00000000-0000-4000-8000-000000000101";

type Product = {
  id: string;
  sourceNames?: string[];
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
      // Mirrors the API: source/status/query filters, name order, offset pages.
      const source = url.searchParams.get("source") ?? "all";
      const status = url.searchParams.get("status") ?? "all";
      const term = (url.searchParams.get("query") ?? "").toLowerCase();
      const pageNumber = Number(url.searchParams.get("page") ?? 1);
      const pageSize = Number(url.searchParams.get("pageSize") ?? 30);
      const matching = products
        .filter((p) => source === "all" || (source === "imported") === Boolean(p.sourceNames?.length))
        .filter((p) => status === "all" || p.status === status)
        .filter((p) => !term || p.name.toLowerCase().includes(term) || (p.sku ?? "").toLowerCase().includes(term))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: matching.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
          page: pageNumber,
          pageSize,
          totalItems: matching.length,
          totalPages: Math.max(1, Math.ceil(matching.length / pageSize)),
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
  await expect(page.getByText("No manual products yet")).toBeVisible();

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

  const more = page.getByRole("button", { name: "More actions for Coffee Candy" });
  await more.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
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

test("keeps secondary row actions in a keyboard-operable menu", async ({ page }) => {
  await mockInventory(page, [makeProduct()]);
  await page.goto("/inventory");
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  const more = page.getByRole("button", { name: "More actions for Coffee Candy" });
  await more.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Restock +1" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(more).toBeFocused();
});

test("separates manual and imported inventory and keeps analytics in Analytics", async ({ page }, testInfo) => {
  await mockInventory(page, [
    makeProduct(),
    makeProduct({ id: "00000000-0000-4000-8000-000000000102", name: "Imported Beans", sourceNames: ["Supplier CSV"] }),
  ]);
  await page.goto("/inventory");
  const nav = page.getByRole("navigation", { name: testInfo.project.name === "desktop" ? "Primary" : "Mobile", exact: true });
  await expect(nav.getByRole("link", { name: "Inventory", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Coffee Candy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Imported Beans" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Inventory analytics" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Manual inventory" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Imported inventory" }).click();
  await expect(page.getByRole("tab", { name: "Manual inventory" })).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("tab", { name: "Imported inventory" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Add product" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Imported Beans" })).toBeVisible();
  await expect(page.getByText("Imported from Supplier CSV")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Coffee Candy" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Import inventory" })).toBeVisible();
  await page.screenshot({ path: `/tmp/mcbuse-demo-inventory-${testInfo.project.name}.png`, fullPage: true });
  await nav.getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(page).toHaveURL("/analytics/general");
  await expect(nav.getByRole("link", { name: "Analytics", exact: true })).toHaveAttribute("aria-current", "page");
});

test("keeps product management available when analytics is unavailable", async ({ page }) => {
  await mockInventory(page, [makeProduct()]);
  await page.route("**/api/merchant/me/analytics?*", (route) => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "Coffee Candy" })).toBeVisible();
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByRole("dialog").getByLabel("Name *")).toBeVisible();
});

test("pages through a large catalogue and keeps the place in the URL", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one pagination proof is enough");
  const many = Array.from({ length: 30 }, (_, i) =>
    makeProduct({
      id: `00000000-0000-4000-8000-${String(200 + i).padStart(12, "0")}`,
      name: `Product ${String(i + 1).padStart(2, "0")}`,
    }),
  );
  await mockInventory(page, many);
  await page.goto("/inventory");

  const pager = page.getByRole("navigation", { name: "Product pages" });
  await expect(pager.getByText("1–25")).toBeVisible();
  await expect(pager.getByText("30")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Product 25" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Product 26" })).toHaveCount(0);
  await expect(pager.getByRole("button", { name: "Previous" })).toBeDisabled();

  await pager.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(pager.getByText("26–30")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Product 26" })).toBeVisible();
  await expect(pager.getByRole("button", { name: "Next" })).toBeDisabled();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Product 30" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search products" }).fill("product 0");
  await expect(page).toHaveURL(/q=product\+0/);
  await expect(page).not.toHaveURL(/page=/);
  await expect(page.getByRole("heading", { name: "Product 09" })).toBeVisible();
  await expect(pager.getByText("1–9")).toBeVisible();
  await expect(pager.getByRole("button", { name: "Next" })).toBeDisabled();

  await page.getByRole("searchbox", { name: "Search products" }).fill("zzz");
  await expect(page.getByText("No matching products")).toBeVisible();
});

test("remembers the selected tab across a reload", async ({ page }) => {
  await mockInventory(page, [
    makeProduct(),
    makeProduct({ id: "00000000-0000-4000-8000-000000000102", name: "Imported Beans", sourceNames: ["Supplier CSV"] }),
  ]);
  await page.goto("/inventory");
  await page.getByRole("tab", { name: "Imported inventory" }).click();
  await expect(page).toHaveURL(/tab=imported/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Imported inventory" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Imported Beans" })).toBeVisible();
});
