import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const output = path.resolve(process.cwd(), "../../out/week2-video/assets");
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: "light",
});
const page = await context.newPage();

await page.route("**/api/v1/**", async (route) => {
  const url = new URL(route.request().url());
  const json = (body) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

  if (url.pathname.endsWith("/wallets")) {
    return json({
      routine: {
        id: "00000000-0000-4000-8000-000000000101",
        type: "routine",
        solanaPubkey: "7YhJd2mCbUseMerchantRoutine4pQ9xZK3aL",
        isActive: true,
        createdAt: "2026-09-01T10:00:00.000Z",
        balances: [
          { currency: "USDC", available: "4215500000", pending: "0" },
          { currency: "EURC", available: "6933500000", pending: "0" },
        ],
      },
      savings: {
        id: "00000000-0000-4000-8000-000000000102",
        type: "savings",
        solanaPubkey: "8KsMcbUseMerchantHolding9pQ4xZa2Lm",
        isActive: true,
        createdAt: "2026-09-01T10:00:00.000Z",
        balances: [{ currency: "USDC", available: "850000000", pending: "0" }],
      },
    });
  }

  if (url.pathname.endsWith("/payment-requests")) {
    return json({
      id: "week2-mobile-request",
      type: "static",
      amount: null,
      currency: null,
      description: null,
      lineItems: null,
      nonce: "00000000-0000-4000-8000-000000000222",
      status: "pending",
      expiresAt: "2026-09-13T22:30:00.000Z",
      createdAt: "2026-09-13T21:30:00.000Z",
      qrString:
        "mcbuse://pay?nonce=00000000-0000-4000-8000-000000000222&v=1",
    });
  }

  return route.fulfill({
    status: 404,
    contentType: "application/json",
    body: JSON.stringify({ message: "Not required for capture" }),
  });
});

await page.goto("http://127.0.0.1:8081/(flows)/receive", {
  waitUntil: "domcontentloaded",
  timeout: 120_000,
});
await page.getByText("Receive", { exact: true }).waitFor({ timeout: 120_000 });
await page.getByText("Share QR Code", { exact: true }).waitFor({
  timeout: 30_000,
});
await page.screenshot({
  path: path.join(output, "mobile-receive.png"),
  fullPage: false,
});

await browser.close();
