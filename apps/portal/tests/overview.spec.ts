import { expect, test } from "@playwright/test";

function summaryPayload({
  receivedTodayMinor = "18420",
  pendingRequestCount = 1,
}: {
  receivedTodayMinor?: string;
  pendingRequestCount?: number;
} = {}) {
  return {
    availableValue: {
      minor: "421550",
      currency: "EUR",
      estimated: true,
      rateTimestamp: new Date().toISOString(),
    },
    receivedToday: {
      minor: receivedTodayMinor,
      currency: "EUR",
      estimated: false,
      rateTimestamp: null,
    },
    received30Days: {
      minor: receivedTodayMinor,
      currency: "EUR",
      estimated: false,
      rateTimestamp: null,
    },
    paymentCount30Days: receivedTodayMinor === "0" ? 0 : 1,
    averageSale: {
      minor: receivedTodayMinor,
      currency: "EUR",
      estimated: false,
      rateTimestamp: null,
    },
    dailyTrend: [
      {
        start: "2026-09-05",
        amountMinor: receivedTodayMinor,
        paymentCount: receivedTodayMinor === "0" ? 0 : 1,
      },
    ],
    hourlyRhythm: Array.from({ length: 24 }, (_, hour) => ({
      start: `${String(hour).padStart(2, "0")}:00`,
      amountMinor: hour === 12 ? receivedTodayMinor : "0",
      paymentCount: hour === 12 && receivedTodayMinor !== "0" ? 1 : 0,
    })),
    captureQualityPercent: receivedTodayMinor === "0" ? 0 : 100,
    lastCapturedAt:
      receivedTodayMinor === "0" ? null : new Date().toISOString(),
    pendingRequestCount,
    problemCount: 0,
    problems: [],
    recordedToday: {
      minor: receivedTodayMinor,
      currency: "EUR",
      estimated: false,
      rateTimestamp: null,
    },
    recordedSaleCountToday: receivedTodayMinor === "0" ? 0 : 1,
    recordedAverageSaleToday: {
      minor: receivedTodayMinor,
      currency: "EUR",
      estimated: false,
      rateTimestamp: null,
    },
    topProductToday: null,
    peakSellingHourToday: receivedTodayMinor === "0" ? null : "12:00",
    recorded30Days: {
      minor: receivedTodayMinor,
      currency: "EUR",
      estimated: false,
      rateTimestamp: null,
    },
    recordedSaleCount30Days: receivedTodayMinor === "0" ? 0 : 1,
    recordedAverageSale: {
      minor: receivedTodayMinor,
      currency: "EUR",
      estimated: false,
      rateTimestamp: null,
    },
    recordedDailyTrend: [
      {
        start: "2026-09-05",
        amountMinor: receivedTodayMinor,
        paymentCount: receivedTodayMinor === "0" ? 0 : 1,
      },
    ],
    recordedHourlyRhythm: Array.from({ length: 24 }, (_, hour) => ({
      start: `${String(hour).padStart(2, "0")}:00`,
      amountMinor: hour === 12 ? receivedTodayMinor : "0",
      paymentCount: hour === 12 && receivedTodayMinor !== "0" ? 1 : 0,
    })),
    lowStockProductCount: 2,
    readinessStage: "building_history",
    lastUpdatedAt: new Date().toISOString(),
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
  await page.route("**/api/merchant/me/summary**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...summaryPayload(),
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
        captureQualityPercent: 50,
        lastCapturedAt: new Date().toISOString(),
        problemCount: 1,
        problems: [
          {
            id: "problem-1",
            code: "payment_failed",
            severity: "warning",
            title: "Payment could not be completed",
            action:
              "Create a new payment request and ask the customer to try again.",
            occurredAt: new Date().toISOString(),
          },
        ],
        lastUpdatedAt: new Date().toISOString(),
      }),
    }),
  );
  await page.route("**/api/merchant/me/activity**", (route) =>
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
            source: "mcbuse_payment",
            verification: "internally_confirmed",
            environment: "test",
            status: "recorded",
            occurredAt: new Date().toISOString(),
          },
        ],
        page: 1,
        pageSize: 5,
        totalItems: 1,
        totalPages: 1,
      }),
    }),
  );
  await page.route("**/api/merchant/me/assessments", (route) =>
    route.fulfill({ json: { assessments: [] } }),
  );
  await page.route("**/api/merchant/me/finance-packages", (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.route("**/api/merchant/me/finance-packages/email-attempts", (route) =>
    route.fulfill({ json: { items: [] } }),
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
    page.getByRole("heading", { name: "Your business, at a glance" }),
  ).toBeVisible();
  await expect(page.getByText("€4,215.50")).toBeVisible();
  await expect(page.getByText("Lunch service")).toBeVisible();
  await expect(page.getByText("Payment could not be completed")).toBeVisible();
  await expect(page.getByText("50.00%")).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Daily recorded sales amount for the last 30 days",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Hourly sales rhythm for the last 30 days",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", {
      name: "Daily recorded sales amount for the last 30 days",
    }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("table", { name: "Hourly sales rhythm" }),
  ).toHaveCount(1);
  if (testInfo.project.name === "desktop") {
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("navigation", { name: "Mobile" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Receive" })).toHaveCount(0);
  }
  await expect(
    page.getByRole("button", { name: "Create request" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("summarises the latest assessment and email without a Business insights panel", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one rendered summary proof is enough");
  let insightsRequested = false;
  await page.route("**/api/merchant/me/insights**", (route) => {
    insightsRequested = true;
    return route.fulfill({ status: 500, json: { message: "Overview must not request insights" } });
  });
  await page.unroute("**/api/merchant/me/assessments");
  await page.route("**/api/merchant/me/assessments", (route) =>
    route.fulfill({ json: { assessments: [assessment({ score: 64.25 })] } }),
  );
  await page.unroute("**/api/merchant/me/finance-packages/email-attempts");
  await page.route("**/api/merchant/me/finance-packages/email-attempts", (route) =>
    route.fulfill({
      json: {
        items: [
          { id: "e1", packageId: "p1", recipientEmail: "loans@bank.example", status: "accepted_by_smtp", createdAt: "2026-09-25T09:30:00.000Z" },
        ],
      },
    }),
  );
  await page.goto("/overview");
  const credit = page.locator("#overview-credit");
  await expect(credit.getByText("64.3 / 100")).toBeVisible();
  await expect(credit.getByText("Medium")).toBeVisible();
  await expect(credit.getByText("Coverage 80.0%")).toBeVisible();
  const finance = page.locator("#overview-finance");
  await expect(finance.getByText("Accepted by mail server")).toBeVisible();
  await expect(finance.getByText("loans@bank.example", { exact: false })).toBeVisible();
  await expect(page.getByText("Delivered", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Business insights" })).toHaveCount(0);
  expect(insightsRequested).toBe(false);
});

test("names missing inputs instead of showing a profile score", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one rendered summary proof is enough");
  await page.unroute("**/api/merchant/me/assessments");
  await page.route("**/api/merchant/me/assessments", (route) =>
    route.fulfill({ json: { assessments: [assessment({ score: null, unavailableFields: ["loanAmountMinor", "commencementDate"] })] } }),
  );
  await page.goto("/overview");
  const credit = page.locator("#overview-credit");
  await expect(credit.getByText("Not available")).toBeVisible();
  await expect(credit.getByText("2 required inputs missing")).toBeVisible();
  await expect(credit.getByText("Profile confidence")).toHaveCount(0);
  await expect(credit.getByText("/ 100")).toHaveCount(0);
});

function assessment({ score, unavailableFields = [] }: { score: number | null; unavailableFields?: string[] }) {
  return {
    id: "a1",
    modelId: "george-financial-profile-v1",
    modelVersion: "2026.09.1",
    stage: "building_history",
    score: null,
    evidenceWindow: { from: "2026-08-26T00:00:00.000Z", to: "2026-09-25T00:00:00.000Z", days: 30 },
    passedRequirements: [],
    missingRequirements: [],
    reliability: {},
    sourceCoverage: {},
    limitations: [],
    disclaimer: "Not a lending decision.",
    businessProfile: {},
    createdAt: "2026-09-25T09:00:00.000Z",
    actorUserId: "u1",
    credit: {
      status: "ready",
      modelVersion: "2026.09.1",
      businessAgeMonths: 18,
      unavailableFields,
      financialProfile: score === null ? null : { score, scale: "0-100", breakdown: {} },
      profileConfidence: score === null ? null : { label: "Medium", confidenceScore: 0.7, coveragePct: 80, dataReliabilityQualityPct: 90, fieldsFilled: 8, fieldsTotal: 10 },
      missingReasons: {},
      indicators: {},
      provenance: {},
      integritySummary: [],
    },
  };
}

test("validates the receive drawer and restores trigger focus", async ({
  page,
}) => {
  await page.goto("/overview");
  const trigger = page.getByRole("button", { name: "Create request" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "Amount", exact: true })
    .fill("1.234");
  await dialog.getByRole("button", { name: "Create payment request" }).click();
  await expect(
    page.getByText("Enter a valid euro amount with up to two decimal places."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("shows one Create request action on every merchant page", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "the shell is shared across widths",
  );

  for (const path of [
    "/overview",
    "/transactions",
    "/inventory",
    "/invoices",
    "/business-profile",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("button", { name: "Create request" }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Create request" }),
    ).toBeVisible();
  }
});

test("a completed request refreshes the dashboard without a reload", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one polling proof is enough");

  let requestCompleted = false;
  let summaryRequests = 0;
  await page.unroute("**/api/merchant/me/summary**");
  await page.route("**/api/merchant/me/summary**", (route) => {
    summaryRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        summaryPayload({
          receivedTodayMinor: requestCompleted ? "450" : "0",
          pendingRequestCount: requestCompleted ? 0 : 1,
        }),
      ),
    });
  });
  await page.route("**/api/merchant/me/payment-requests", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "request-poll",
        amount: {
          minor: "450",
          currency: "EUR",
          estimated: false,
          rateTimestamp: new Date().toISOString(),
        },
        description: "Lunch order",
        status: "pending",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        qrPayload:
          "mcbuse://pay?nonce=00000000-0000-4000-8000-000000000001&v=1",
        completedAt: null,
        createdAt: new Date().toISOString(),
      }),
    }),
  );
  await page.route(
    "**/api/merchant/me/payment-requests/request-poll",
    (route) => {
      requestCompleted = true;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: "request-poll",
          amount: {
            minor: "450",
            currency: "EUR",
            estimated: false,
            rateTimestamp: new Date().toISOString(),
          },
          description: "Lunch order",
          status: "completed",
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          qrPayload:
            "mcbuse://pay?nonce=00000000-0000-4000-8000-000000000001&v=1",
          completedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        }),
      });
    },
  );

  await page.goto("/overview");
  const trigger = page.getByRole("button", { name: "Create request" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Amount", exact: true })
    .fill("4.50");
  await dialog
    .getByRole("textbox", { name: "Description" })
    .fill("Lunch order");
  await dialog.getByRole("button", { name: "Create payment request" }).click();
  await expect(page.getByLabel("Payment request QR code")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Close payment request drawer" })
    .click();
  await expect(dialog).toBeHidden();
  await trigger.click();
  await expect(page.getByLabel("Payment request QR code")).toBeVisible();
  await expect(page.getByText("Payment received")).toBeVisible({
    timeout: 7_000,
  });
  await expect.poll(() => summaryRequests).toBeGreaterThan(1);
  await expect(
    page.getByText("Recorded sales today").locator("..").getByText("€4.50"),
  ).toBeVisible();
});

test("shows honest empty states for zero-filled merchant buckets", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one state proof is enough");

  await page.unroute("**/api/merchant/me/summary**");
  await page.unroute("**/api/merchant/me/activity**");
  await page.route("**/api/merchant/me/summary**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        summaryPayload({ receivedTodayMinor: "0", pendingRequestCount: 0 }),
      ),
    }),
  );
  await page.route("**/api/merchant/me/activity**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        page: 1,
        pageSize: 5,
        totalItems: 0,
        totalPages: 1,
      }),
    }),
  );

  await page.goto("/overview");
  await expect(
    page.getByText("Your first sale will appear here"),
  ).toBeVisible();
  await expect(page.getByText("No recorded activity yet")).toBeVisible();
  await expect(page.getByText("No data")).toBeVisible();
});

test("shows a safe error when the initial summary request fails", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one state proof is enough");

  await page.unroute("**/api/merchant/me/summary**");
  await page.route("**/api/merchant/me/summary**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Service unavailable" }),
    }),
  );

  await page.goto("/overview");
  await expect(page.getByText("We could not load this")).toBeVisible();
  await expect(page.getByText("Your payment records are safe.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("keeps loaded values visible when a refresh is delayed", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one state proof is enough");

  let summaryRequests = 0;
  await page.unroute("**/api/merchant/me/summary**");
  await page.route("**/api/merchant/me/summary**", (route) => {
    summaryRequests += 1;
    if (summaryRequests === 1) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(summaryPayload()),
      });
    }
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Service unavailable" }),
    });
  });

  await page.goto("/overview");
  await expect(page.getByText("€4,215.50")).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("merchant:refresh")),
  );
  await expect.poll(() => summaryRequests).toBeGreaterThan(1);
  await expect(page.getByText("Live updates are delayed.")).toBeVisible();
  await expect(page.getByText("€4,215.50")).toBeVisible();
});

test("identifies an offline refresh while retaining loaded values", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one state proof is enough");

  await page.goto("/overview");
  await expect(page.getByText("€4,215.50")).toBeVisible();
  await page.unroute("**/api/merchant/me/summary**");
  await page.route("**/api/merchant/me/summary**", (route) =>
    route.abort("internetdisconnected"),
  );
  await page.evaluate(() => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    window.dispatchEvent(new Event("merchant:refresh"));
  });
  await expect(page.getByText("You appear to be offline.")).toBeVisible();
  await expect(page.getByText("€4,215.50")).toBeVisible();
});
