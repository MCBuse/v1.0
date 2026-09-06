import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([
    {
      name: "mcbuse_portal_access",
      value: "test-only",
      url: "http://127.0.0.1:3001",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.route("**/api/merchant/me/summary**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        availableValue: {
          minor: "421550",
          currency: "EUR",
          estimated: true,
          rateTimestamp: new Date().toISOString(),
        },
        receivedToday: {
          minor: "18420",
          currency: "EUR",
          estimated: false,
          rateTimestamp: null,
        },
        received30Days: {
          minor: "321090",
          currency: "EUR",
          estimated: false,
          rateTimestamp: null,
        },
        paymentCount30Days: 21,
        averageSale: {
          minor: "15290",
          currency: "EUR",
          estimated: false,
          rateTimestamp: null,
        },
        dailyTrend: [
          { start: "2026-09-05", amountMinor: "18420", paymentCount: 2 },
        ],
        hourlyRhythm: Array.from({ length: 24 }, (_, hour) => ({
          start: `${String(hour).padStart(2, "0")}:00`,
          amountMinor: hour === 12 ? "18420" : "0",
          paymentCount: hour === 12 ? 2 : 0,
        })),
        pendingRequestCount: 1,
        problemCount: 0,
        lastUpdatedAt: new Date().toISOString(),
      }),
    }),
  );
  await page.route("**/api/merchant/me/transactions**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "txn-1",
            receiptNumber: "MCB-TEST123",
            amount: {
              minor: "9210",
              currency: "EUR",
              estimated: false,
              rateTimestamp: null,
            },
            description: "Lunch service",
            status: "received",
            receivedAt: new Date().toISOString(),
          },
        ],
        page: 1,
        pageSize: 5,
        totalItems: 1,
        totalPages: 1,
      }),
    }),
  );
});

test("overview renders money records and responsive navigation", async ({
  page,
}, testInfo) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.goto("/overview");
  await page.waitForTimeout(500);
  if (browserErrors.length) throw new Error(browserErrors.join("\n"));
  await expect(
    page.getByRole("heading", { name: "Your money, at a glance" }),
  ).toBeVisible();
  await expect(page.getByText("€4,215.50")).toBeVisible();
  await expect(page.getByText("Lunch service")).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("navigation", { name: "Mobile" }),
    ).toBeVisible();
  }
});
