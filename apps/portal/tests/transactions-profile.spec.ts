import { expect, test } from "@playwright/test";

const portalUrl = "http://127.0.0.1:3101";

function receipt(id: string, description: string, minor: string) {
  return {
    id,
    receiptNumber: `MCB-${id.toUpperCase()}`,
    amount: {
      minor,
      currency: "EUR",
      estimated: false,
      rateTimestamp: null,
    },
    description,
    status: "received",
    receivedAt: "2026-09-12T10:30:00.000Z",
  };
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: "mcbuse_portal_access",
      value: "test-only",
      url: portalUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "mcbuse_portal_csrf",
      value: "test-csrf",
      url: portalUrl,
      httpOnly: false,
      sameSite: "Lax",
    },
  ]);
});

test("preserves old-bookmark query parameters when moving to a pillar route", async ({
  page,
}) => {
  const redirects: Array<[string, string]> = [
    ["/transactions?source=merchant_cash&page=2", "/analytics/transactions?source=merchant_cash&page=2"],
    ["/inventory?query=tea", "/analytics/inventory?query=tea"],
    ["/invoices?status=history", "/payment/invoices?status=history"],
    ["/business-profile?section=consent", "/credit-assessment/business-profile?section=consent"],
  ];
  for (const [legacyPath, canonicalPath] of redirects) {
    await page.goto(legacyPath);
    await expect(page).toHaveURL(canonicalPath);
  }
});

test("lists fast payment requests separately from itemised invoices", async ({
  page,
}) => {
  await page.route("**/api/merchant/me/payment-requests?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "00000000-0000-4000-8000-000000000042",
            amount: {
              minor: "1850",
              currency: "EUR",
              estimated: false,
              rateTimestamp: null,
            },
            description: "Lunch order",
            status: "pending",
            expiresAt: "2026-09-19T12:00:00.000Z",
            qrPayload: "mcbuse://pay?nonce=example&v=1",
            completedAt: null,
            createdAt: "2026-09-18T10:00:00.000Z",
          },
        ],
        page: 1,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
      }),
    }),
  );
  await page.goto("/payment");
  await expect(page.getByRole("heading", { name: "Fast payment requests" })).toBeVisible();
  await expect(page.getByText("Lunch order")).toBeVisible();
  await expect(page.getByText("pending")).toBeVisible();
  await expect(page.getByText("€18.50")).toBeVisible();
});

test("keeps activity provenance filters and pagination in the URL", async ({
  page,
}) => {
  const requested: string[] = [];
  await page.route("**/api/merchant/me/activity**", (route) => {
    const url = new URL(route.request().url());
    requested.push(url.search);
    const currentPage = Number(url.searchParams.get("page") ?? "1");
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            ...receipt(`sale-${currentPage}`, "Counter sale", currentPage === 1 ? "450" : "900"),
            source: "merchant_cash",
            verification: "merchant_declared",
            environment: "unknown",
            status: "recorded",
            occurredAt: "2026-09-17T12:00:00.000Z",
          },
        ],
        page: currentPage,
        pageSize: 20,
        totalItems: 21,
        totalPages: 2,
      }),
    });
  });

  await page.goto("/analytics/transactions");
  await expect(page.getByText("Counter sale")).toBeVisible();
  await page.getByLabel("Source").selectOption("merchant_cash");
  await expect(page).toHaveURL(/source=merchant_cash/);
  await page.getByLabel("Environment").selectOption("unknown");
  await expect(page).toHaveURL(/environment=unknown/);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText("Page 2 of 2 · 21 records")).toBeVisible();
  expect(requested.some((search) => search.includes("source=merchant_cash") && search.includes("environment=unknown"))).toBe(true);
});

test("shows transaction empty and error states without leaking technical data", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one state proof is enough");
  let fail = false;
  await page.route("**/api/merchant/me/activity**", (route) =>
    fail
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "internal_rpc_signature_ABC123" }),
        })
      : route.fulfill({
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

  await page.goto("/analytics/transactions");
  await expect(page.getByText("No recorded sales yet")).toBeVisible();
  fail = true;
  await page.reload();
  await expect(page.getByText("We could not load this")).toBeVisible();
  await expect(page.getByText("ABC123")).toHaveCount(0);
});

test("shows readiness boundaries and persists consent with CSRF", async ({
  page,
}) => {
  let consentActive = false;
  let submittedCsrf = "";
  await page.route("**/api/merchant/me/evidence-readiness", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        stage: consentActive ? "building_history" : "insufficient_evidence",
        measured: {
          observedDays: 8,
          activeDays: 4,
          finalizedPayments: 6,
          captureQualityPercent: 100,
          finalityPercent: 100,
          activeConsent: consentActive,
          unresolvedCriticalException: false,
        },
        passedRequirements: ["At least 7 observed days"],
        missingRequirements: ["At least 25 finalized payments"],
        disclaimer:
          "Evidence readiness is not credit approval. Lending decisions remain with licensed lenders.",
      }),
    }),
  );
  await page.route("**/api/merchant/me/consents", async (route) => {
    if (route.request().method() === "POST") {
      submittedCsrf = route.request().headers()["x-csrf-token"] ?? "";
      const body = route.request().postDataJSON() as { active?: boolean };
      consentActive = body.active === true;
    }
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        active: consentActive,
        purpose: "credit_evidence_assessment",
        version: "1",
        recordedAt: consentActive ? "2026-09-12T11:00:00.000Z" : null,
      }),
    });
  });
  await page.route("**/api/merchant/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "merchant-public-id",
        businessName: "Berlin Lunch Counter",
        timezone: "Europe/Berlin",
        displayCurrency: "EUR",
        role: "owner",
      }),
    }),
  );

  await page.goto("/business-profile");
  await expect(
    page.getByRole("heading", { name: "Berlin Lunch Counter" }),
  ).toBeVisible();
  await expect(
    page.getByText("Evidence readiness is not credit approval."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Give consent" }).click();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  expect(submittedCsrf).toBe("test-csrf");
});

test("keeps consent state unchanged when an update fails", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one failure proof is enough");
  await page.route("**/api/merchant/me/evidence-readiness", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        stage: "insufficient_evidence",
        measured: {
          observedDays: 0,
          activeDays: 0,
          finalizedPayments: 0,
          captureQualityPercent: 0,
          finalityPercent: 0,
          activeConsent: false,
          unresolvedCriticalException: false,
        },
        passedRequirements: [],
        missingRequirements: ["At least 7 observed days"],
        disclaimer:
          "Evidence readiness is not credit approval. Lending decisions remain with licensed lenders.",
      }),
    }),
  );
  await page.route("**/api/merchant/me/consents", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Consent could not be saved" }),
        })
      : route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            active: false,
            purpose: "credit_evidence_assessment",
            version: "1",
            recordedAt: null,
          }),
        }),
  );
  await page.route("**/api/merchant/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "merchant-public-id",
        businessName: "Berlin Lunch Counter",
        timezone: "Europe/Berlin",
        displayCurrency: "EUR",
        role: "owner",
      }),
    }),
  );

  await page.goto("/business-profile");
  await page.getByRole("button", { name: "Give consent" }).click();
  await expect(page.getByText("Consent could not be saved")).toBeVisible();
  await expect(page.getByText("Not active")).toBeVisible();
});
