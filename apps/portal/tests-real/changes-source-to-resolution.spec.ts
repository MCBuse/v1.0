import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { realEnv } from "./real-env";

/**
 * Plan §9.5 (checklist 9.5.source-to-resolution), against the real API, the
 * real portal and an isolated PostgreSQL:
 *
 *   source mutation → durable event → worker → saved states → Changes page →
 *   inventory action → restock → worker → recalculated resolution.
 *
 * Every step is proven where it happens: the event and states in the
 * database, the case through the merchant's own pages.
 */

const env = realEnv();
const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../api");
// pg is the API's dependency, not the portal's: borrow it and type only what is used.
type Pool = { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>; end(): Promise<void> };
const { Pool } = createRequire(resolve(API_DIR, "package.json"))("pg") as {
  Pool: new (config: { connectionString: string; max: number }) => Pool;
};
const db = new Pool({ connectionString: env.databaseUrl, max: 2 });
const run = Date.now().toString(36);
const EMAIL = `e2e-real-${run}@example.test`;
const PASSWORD = "E2e-real-Passw0rd!";
const PRODUCT = `Rye roll ${run}`;

test.afterAll(() => db.end());

async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const send = () =>
    fetch(`${env.apiUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  // A pooled keep-alive socket can be closed by the API while a CLI step runs; the request never reached it.
  const res = await send().catch(send);
  const body = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${body}`);
  return (body ? JSON.parse(body) : null) as T;
}

/** The Changes worker's "process one merchant now" operator command (runbook §3). */
function worker(merchantRef: string) {
  const out = execFileSync("pnpm", ["--silent", "changes:ops", "--merchant", merchantRef], {
    cwd: API_DIR,
    env: { ...process.env, ...env.worker },
    encoding: "utf8",
  });
  const log = JSON.parse(out.trim().split("\n").filter((l) => l.startsWith("{")).at(-1)!);
  expect(log, out).toMatchObject({ type: "change_intelligence_execution", processed: 1, failed: 0 });
  return log;
}

async function one<T>(sql: string, params: unknown[]): Promise<T> {
  return (await db.query(sql, params)).rows[0] as T;
}

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/sign-in/);
}

test("9.5.source-to-resolution: a sale opens a stock case end to end, and a restock through Inventory resolves it", async ({ page }) => {
  // --- A real merchant: signup, verified email, provisioned workspace, one product.
  await api("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, firstName: "Real", lastName: "Path", username: `e2e_real_${run}` }),
  });
  await db.query("UPDATE users SET is_email_verified = true WHERE email = $1", [EMAIL]);
  // provision-merchant loads dotenv from its cwd: run it from src/, where there is no .env.
  execFileSync("npx", ["ts-node", "-T", "--project", "../tsconfig.json", "data-capture/provision-merchant.ts", "--email", EMAIL, "--business-name", `Real path café ${run}`], {
    cwd: resolve(API_DIR, "src"),
    env: { ...process.env, ...env.worker },
  });
  const { accessToken: token } = await api<{ accessToken: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const merchant = await api<{ id: string }>("/merchants/me", { token });
  const product = await api<{ id: string }>("/merchants/me/products", {
    method: "POST",
    token,
    body: JSON.stringify({ name: PRODUCT, category: "Bakery", unitPriceMinor: "250", quantity: 20, lowStockThreshold: 5 }),
  });

  // --- Bootstrap: initialization run, no stock problem yet.
  expect(worker(merchant.id).runIds).toHaveLength(1);
  const risk = () =>
    one<{ value: { level: string }; version: string }>(
      "SELECT value, version::text FROM merchant_change_states WHERE product_id = $1 AND node_key = 'stock_risk'",
      [product.id],
    );
  // No sales yet: no stock problem, and no projection (building history).
  expect((await risk()).value.level).toBe("forecast_unavailable");
  const initialized = await one<{ bootstrap_status: string }>(
    "SELECT w.bootstrap_status FROM merchant_change_work w JOIN merchants m ON m.id = w.merchant_id WHERE m.public_id = $1",
    [merchant.id],
  );
  expect(initialized.bootstrap_status).toBe("completed");

  // --- Source mutation: a cash sale of 17 leaves 3 against a minimum of 5.
  const sale = await api<{ id: string }>("/merchants/me/cash-sales", {
    method: "POST",
    token,
    headers: { "Idempotency-Key": `e2e-real-${run}-sale` },
    body: JSON.stringify({ lines: [{ type: "product", productId: product.id, quantity: 17 }], occurredAt: new Date().toISOString() }),
  });
  // Durable event, written in the sale's own transaction and still pending.
  const pending = await one<{ n: number }>(
    "SELECT count(*)::int AS n FROM merchant_change_events WHERE source_id = $1 AND status = 'pending'",
    [sale.id],
  );
  expect(pending.n).toBeGreaterThan(0);

  // --- Worker → saved states and an active case.
  worker(merchant.id);
  expect(
    (await one<{ n: number }>("SELECT count(*)::int AS n FROM merchant_change_events WHERE source_id = $1 AND status = 'pending'", [sale.id])).n,
  ).toBe(0);
  expect((await risk()).value.level).toBe("low_stock");
  const opened = await one<{ id: string; status: string }>(
    "SELECT id, status FROM merchant_change_cases WHERE product_id = $1 AND case_type = 'stock_risk'",
    [product.id],
  );
  expect(opened.status).toBe("active");

  // --- The merchant sees it on the Changes page and its detail.
  await signIn(page);
  await page.goto("/analytics/changes");
  const main = page.getByRole("main");
  const headline = `${PRODUCT} is at or below minimum stock`;
  const card = main.getByRole("article", { name: headline });
  await expect(card).toBeVisible();
  await expect(card.getByText("3 units available against a minimum of 5.")).toBeVisible();
  await card.getByRole("link", { name: "View explanation" }).click();
  await expect(page).toHaveURL(new RegExp(`/analytics/changes/${opened.id}$`));
  await expect(main.getByText("3 units available against a minimum of 5.").first()).toBeVisible();

  // --- Inventory action: "Review stock" opens that product; restock to 30 through the drawer.
  await main.getByRole("link", { name: "Review stock" }).click();
  await expect(page).toHaveURL(new RegExp(`/inventory\\?productId=${product.id}&action=stock$`));
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByLabel("Name *")).toHaveValue(PRODUCT);
  await expect(drawer.getByLabel("On hand *")).toHaveValue("3");
  const adjustment = page.waitForResponse(
    (r) => r.url().includes(`/products/${product.id}/stock-adjustments`) && r.request().method() === "POST",
  );
  await drawer.getByLabel("On hand *").fill("30");
  await drawer.getByRole("button", { name: "Save changes" }).click();
  expect((await adjustment).ok()).toBe(true);
  await expect(drawer).toHaveCount(0);
  expect(
    (await one<{ n: number }>(
      "SELECT count(*)::int AS n FROM merchant_change_events WHERE new_product_id = $1 AND status = 'pending'",
      [product.id],
    )).n,
  ).toBeGreaterThan(0);

  // --- Worker → recalculated resolution, visible to the merchant.
  worker(merchant.id);
  expect(["low_stock", "out_of_stock"]).not.toContain((await risk()).value.level);
  const resolved = await one<{ status: string; resolution: string }>(
    "SELECT status, resolution FROM merchant_change_cases WHERE id = $1",
    [opened.id],
  );
  expect(resolved).toEqual({ status: "resolved", resolution: "stock_normal" });

  await page.goto(`/analytics/changes/${opened.id}`);
  await expect(main.getByText(/Resolved .*Stock back to normal/).first()).toBeVisible();
  await page.goto("/analytics/changes");
  await expect(main.getByRole("article", { name: headline })).toHaveCount(0);
  await page.goto("/analytics/changes?status=resolved");
  const closed = main.getByRole("article", { name: `${PRODUCT} stock is back to normal` });
  await expect(closed.getByText("Stock back to normal")).toBeVisible();
  await expect(closed.getByRole("link", { name: `${PRODUCT} stock is back to normal` })).toHaveAttribute("href", `/analytics/changes/${opened.id}`);
});
