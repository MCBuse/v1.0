import { expect, test } from "@playwright/test";
import path from "node:path";

const outputDirectory = path.resolve(
  process.cwd(),
  "../../out/week2-video/assets",
);
const now = new Date().toISOString();

function money(minor: string, estimated = false) {
  return {
    minor,
    currency: "EUR",
    estimated,
    rateTimestamp: estimated ? now : null,
  };
}

test("capture the Week 2 product surfaces", async ({ context, page }) => {
  await context.addCookies([
    {
      name: "mcbuse_portal_access",
      value: "test-only",
      url: "http://127.0.0.1:3101",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "mcbuse_portal_csrf",
      value: "week2-video",
      url: "http://127.0.0.1:3101",
      sameSite: "Lax",
    },
  ]);

  const dailyAmounts = [
    9200, 12400, 8700, 15300, 18100, 14200, 0, 19600, 21200, 16800,
    22400, 17100, 25900, 0, 24300, 28600, 19400, 27300, 30100, 26400,
    0, 31800, 29200, 33700, 28100, 35400, 32200, 0, 38900, 42150,
  ];

  await page.route("**/api/merchant/me/summary**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        availableValue: money("421550", true),
        receivedToday: money("42150"),
        received30Days: money("693350"),
        paymentCount30Days: 86,
        averageSale: money("8062"),
        dailyTrend: dailyAmounts.map((amount, index) => {
          const day = new Date("2026-08-15T00:00:00.000Z");
          day.setUTCDate(day.getUTCDate() + index);
          return {
            start: day.toISOString().slice(0, 10),
            amountMinor: String(amount),
            paymentCount:
              amount === 0 ? 0 : Math.max(1, Math.round(amount / 8500)),
          };
        }),
        hourlyRhythm: Array.from({ length: 24 }, (_, hour) => ({
          start: `${String(hour).padStart(2, "0")}:00`,
          amountMinor:
            hour >= 7 && hour <= 19
              ? String(11000 + ((hour * 4700) % 23000))
              : "0",
          paymentCount: hour >= 7 && hour <= 19 ? 2 + (hour % 4) : 0,
        })),
        captureQualityPercent: 98.7,
        lastCapturedAt: now,
        pendingRequestCount: 1,
        problemCount: 1,
        problems: [
          {
            id: "problem-delayed",
            code: "payment_delayed",
            severity: "warning",
            title: "One payment needs attention",
            action: "Check the payment status before creating another request.",
            occurredAt: now,
          },
        ],
        lastUpdatedAt: now,
      }),
    }),
  );

  await page.route("**/api/merchant/me/transactions**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "receipt-1",
            receiptNumber: "MCB-71K4P2",
            amount: money("2850"),
            description: "Lunch service",
            status: "received",
            receivedAt: now,
          },
          {
            id: "receipt-2",
            receiptNumber: "MCB-53Q9H8",
            amount: money("1240"),
            description: "Counter sale",
            status: "received",
            receivedAt: "2026-09-13T17:42:00.000Z",
          },
          {
            id: "receipt-3",
            receiptNumber: "MCB-28M6R3",
            amount: money("7600"),
            description: "Afternoon order",
            status: "received",
            receivedAt: "2026-09-13T16:18:00.000Z",
          },
        ],
        page: 1,
        pageSize: 20,
        totalItems: 3,
        totalPages: 1,
      }),
    }),
  );

  await page.route("**/api/merchant/me/evidence-readiness", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        stage: "building_history",
        measured: {
          observedDays: 18,
          activeDays: 8,
          finalizedPayments: 19,
          captureQualityPercent: 98.7,
          finalityPercent: 99.1,
          activeConsent: true,
          unresolvedCriticalException: false,
        },
        passedRequirements: [
          "At least 7 observed days",
          "At least 5 finalized payments",
          "Capture quality of at least 98%",
          "Evidence consent is active",
        ],
        missingRequirements: [
          "At least 30 observed days",
          "At least 10 active days",
          "At least 25 finalized payments",
        ],
        disclaimer:
          "Evidence readiness is not credit approval. Lending decisions remain with licensed lenders.",
      }),
    }),
  );

  await page.route("**/api/merchant/me/consents", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        active: true,
        purpose: "credit_evidence_assessment",
        version: "1",
        recordedAt: "2026-09-05T09:00:00.000Z",
      }),
    }),
  );

  await page.route("**/api/merchant/me/payment-requests", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "week2-payment-request",
        amount: money("1850"),
        description: "Lunch order",
        status: "pending",
        expiresAt: "2026-09-13T19:30:00.000Z",
        qrPayload:
          "mcbuse://pay?nonce=00000000-0000-4000-8000-000000000222&v=1",
        completedAt: null,
        createdAt: now,
      }),
    }),
  );

  await page.goto("/overview");
  await expect(page.getByText("€4,215.50")).toBeVisible();
  await page.screenshot({ path: path.join(outputDirectory, "overview.png") });

  await page.getByRole("button", { name: "Create request" }).click();
  const drawer = page.getByRole("dialog");
  await drawer
    .getByRole("textbox", { name: "Amount", exact: true })
    .fill("18.50");
  await drawer.getByRole("textbox", { name: "Description" }).fill("Lunch order");
  await drawer.getByRole("button", { name: "Create payment request" }).click();
  await expect(page.getByLabel("Payment request QR code")).toBeVisible();
  await page.screenshot({
    path: path.join(outputDirectory, "payment-request.png"),
  });

  await page.goto("/transactions");
  await expect(page.getByText("Lunch service")).toBeVisible();
  await page.screenshot({
    path: path.join(outputDirectory, "transactions.png"),
  });

  await page.goto("/business-profile");
  await expect(page.getByText("Building history", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Evidence readiness is not credit approval."),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(outputDirectory, "readiness.png"),
  });
});
