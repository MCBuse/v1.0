import { expect, test } from "@playwright/test";

const PRESENTED = {
  paymentRequestId: "00000000-0000-4000-8000-00000000000a",
  nonce: "mcbuse://pay?nonce=00000000-0000-4000-8000-00000000000a&v=1",
  status: "pending",
  displayAmountMinor: "1850",
  displayCurrency: "EUR",
  settlementAmount: "20000000",
  settlementCurrency: "USDC",
  description: "Counter sale",
  invoiceNumber: null,
  expiresAt: "2026-09-21T18:00:00.000Z",
  presentedAt: "2026-09-21T17:00:00.000Z",
  presentedByUserId: "00000000-0000-4000-8000-000000000009",
  lines: [],
};

/** Everything the Payment page needs apart from the live feed under test. */
async function routeSupportingApis(page: import("@playwright/test").Page) {
  await page.route("**/api/accounts/", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        accounts: [],
        today: {
          businessDate: "2026-09-21",
          timezone: "Europe/Berlin",
          digitalReceiptsCents: "0",
          digitalReceiptCount: 0,
          cashRecordedCents: "0",
          cashRecordedCount: 0,
          note: "Today's receipts are shown separately.",
        },
        custody: { network: "Solana devnet", model: "Custodial.", note: "No SOL needed." },
      }),
    }),
  );
  await page.route("**/api/accounts/day-end**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        businessDate: "2026-09-21",
        timezone: "Europe/Berlin",
        routine: { availableCents: "0", pendingCents: "0" },
        today: {
          digitalReceiptsCents: "0",
          digitalReceiptCount: 0,
          cashRecordedMinor: "0",
          cashRecordedCurrency: "EUR",
          cashRecordedCount: 0,
        },
        previousTransfers: [],
        suggestion: { amountCents: "0", cappedBy: "todays_receipts", explanation: "Nothing to move." },
        cashNote: "Cash is recorded but not swept.",
      }),
    }),
  );
  await page.route("**/api/merchant/me/payment-requests**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 1 }),
    }),
  );
  await page.route("**/api/merchant/me/products**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [], page: 1, pageSize: 100, totalItems: 0, totalPages: 1 }),
    }),
  );
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
  await routeSupportingApis(page);
});

test("Q.4 — the presented request appears on the counter panel", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.route("**/api/merchant/me/presented-request", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ request: PRESENTED, latestSequence: "12" }),
    }),
  );

  await page.goto("/payment");
  const counter = page.getByRole("region", { name: "Counter display" });
  await expect(counter.getByText("€18.50")).toBeVisible();
  await expect(counter.getByText("Counter sale")).toBeVisible();
  await expect(
    counter.getByLabel("Presented payment request QR code"),
  ).toBeVisible();
});

test("Q.10 — the live connection has a visible, named state", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.route("**/api/merchant/me/presented-request", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ request: PRESENTED, latestSequence: "12" }),
    }),
  );

  await page.goto("/payment");
  const counter = page.getByRole("region", { name: "Counter display" });
  // Whatever it settles on, it must say which of the states it is in.
  await expect(
    counter.getByText(
      /Live|Connecting|Reconnecting|Checking every few seconds|Offline/,
    ).first(),
  ).toBeVisible();
});

test("Q.10 — a stream that will not open falls back to polling and says so", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  let polls = 0;
  await page.route("**/api/merchant/me/presented-request", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ request: PRESENTED, latestSequence: "12" }),
    }),
  );
  // The stream is refused outright, three times over.
  await page.route("**/api/merchant/me/events/stream", (route) =>
    route.fulfill({ status: 503, contentType: "text/plain", body: "no" }),
  );
  await page.route("**/api/merchant/me/events**", (route) => {
    if (route.request().url().includes("/stream")) return route.fallback();
    polls += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ events: [], latestSequence: "12" }),
    });
  });

  await page.goto("/payment");
  const counter = page.getByRole("region", { name: "Counter display" });
  await expect(counter.getByText("Checking every few seconds")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    counter.getByText("updates arrive a few seconds late", { exact: false }),
  ).toBeVisible();
  // And it really is polling, not just claiming to.
  await expect.poll(() => polls, { timeout: 15_000 }).toBeGreaterThan(0);
});

test("the counter can be cleared", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  let cleared = false;
  await page.route("**/api/merchant/me/presented-request", (route) => {
    if (route.request().method() === "DELETE") {
      cleared = true;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ cleared: true }),
      });
    }
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ request: PRESENTED, latestSequence: "12" }),
    });
  });

  await page.goto("/payment");
  const counter = page.getByRole("region", { name: "Counter display" });
  await counter.getByRole("button", { name: "Clear the counter" }).click();
  await expect.poll(() => cleared).toBe(true);
  await expect(counter.getByText("Nothing is on the counter.")).toBeVisible();
});

test("an empty counter says so rather than showing a blank card", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.route("**/api/merchant/me/presented-request", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ request: null, latestSequence: null }),
    }),
  );

  await page.goto("/payment");
  const counter = page.getByRole("region", { name: "Counter display" });
  await expect(counter.getByText("Nothing is on the counter.")).toBeVisible();
  await expect(
    counter.getByText("appears here and on every other signed-in device", {
      exact: false,
    }),
  ).toBeVisible();
});

test("Q.4 — a created request can be put on the counter", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  let presentedId: string | null = null;
  await page.route("**/api/merchant/me/presented-request", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ request: null, latestSequence: null }),
    }),
  );
  await page.route("**/api/merchant/me/payment-requests", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "request-present",
        amount: {
          minor: "1850",
          currency: "EUR",
          estimated: false,
          rateTimestamp: null,
        },
        description: "Counter sale",
        status: "pending",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        qrPayload: "mcbuse://pay?nonce=abc&v=1",
        completedAt: null,
        createdAt: new Date().toISOString(),
      }),
    });
  });
  await page.route(
    "**/api/merchant/me/payment-requests/request-present/present",
    (route) => {
      presentedId = "request-present";
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(PRESENTED),
      });
    },
  );
  await page.route("**/api/merchant/me/payment-requests/request-present", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "request-present",
        amount: {
          minor: "1850",
          currency: "EUR",
          estimated: false,
          rateTimestamp: null,
        },
        description: "Counter sale",
        status: "pending",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        qrPayload: "mcbuse://pay?nonce=abc&v=1",
        completedAt: null,
        createdAt: new Date().toISOString(),
      }),
    }),
  );

  await page.goto("/payment");
  await page.getByRole("button", { name: "Create request" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Amount", exact: true }).fill("18.50");
  await dialog.getByRole("button", { name: "Create payment request" }).click();
  await expect(dialog.getByLabel("Payment request QR code")).toBeVisible();

  await dialog.getByRole("button", { name: "Present on app" }).click();
  await expect.poll(() => presentedId).toBe("request-present");
  await expect(
    dialog.getByRole("button", { name: "On the counter" }),
  ).toBeDisabled();
});
