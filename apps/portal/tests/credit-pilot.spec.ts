import { expect, test } from "@playwright/test";
async function staffLogin(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("analyst@example.test");
  await page.getByLabel("Password", { exact: true }).fill("analyst-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/credit-assessments$/);
}
test("staff-only login runs synthetic scoring, displays provenance, and handles missing margin", async ({
  page,
}) => {
  await staffLogin(page);
  await page.getByRole("button", { name: "Run pilot assessment" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Experimental credit risk",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("660 · Acceptable")).toBeVisible();
  await page
    .getByText("Input snapshot and provenance", { exact: true })
    .click();
  await expect(
    page.getByText('"synthetic_demonstration"', { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/mcbuse-credit-staff-desktop.png",
    fullPage: true,
  });
  await page
    .getByLabel("Evidence source")
    .selectOption("example:missing-margin");
  await page.getByRole("button", { name: "Run pilot assessment" }).click();
  await expect(
    page.getByText(
      "Experimental credit score unavailable. Required inputs are missing.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Experimental credit risk",
      exact: true,
    }),
  ).toHaveCount(0);
});
test("merchant cannot access staff pages, private history, or model metadata", async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: "mcbuse_portal_access",
      value: "test-only",
      url: "http://127.0.0.1:3101",
      httpOnly: true,
    },
  ]);
  await page.goto("/staff/credit-assessments");
  await expect(
    page.getByRole("heading", { name: "Staff access required" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run pilot assessment" }),
  ).toHaveCount(0);
  for (const path of [
    "credit-assessments",
    "credit-assessments/model",
    "credit-assessments/merchants",
  ]) {
    const r = await page.request.get("/api/staff/" + path);
    expect(r.status()).toBe(403);
    expect(await r.text()).not.toContain("probabilityOfDefault");
  }
  expect(
    (await page.request.get("/api/merchant/staff/credit-assessments")).status(),
  ).toBe(404);
});
test("staff session refresh works without merchant membership", async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: "mcbuse_portal_refresh",
      value: "staff-refresh",
      url: "http://127.0.0.1:3101",
      httpOnly: true,
    },
  ]);
  await page.goto("/staff/credit-assessments");
  await expect(
    page.getByRole("heading", { name: "Credit assessments", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run pilot assessment" }),
  ).toBeEnabled();
});
test("staff mutation requires CSRF and merchant UI shows no experimental results", async ({
  page,
  context,
}) => {
  await staffLogin(page);
  expect(
    (
      await page.request.post("/api/staff/credit-assessments", {
        data: { exampleId: "complete" },
      })
    ).status(),
  ).toBe(403);
  await context.clearCookies();
  await context.addCookies([
    {
      name: "mcbuse_portal_access",
      value: "test-only",
      url: "http://127.0.0.1:3101",
      httpOnly: true,
    },
  ]);
  await page.route("**/api/merchant/me/assessments", (r) =>
    r.fulfill({
      json: {
        assessments: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            modelId: "readiness-rules-v1",
            modelVersion: "1.0.0",
            stage: "building_history",
            score: null,
            createdAt: "2026-09-20",
            evidenceWindow: { from: "2026-06-22", to: "2026-09-20", days: 90 },
            passedRequirements: [],
            missingRequirements: [],
            reliability: {},
            sourceCoverage: {},
            businessProfile: {},
            limitations: [],
            disclaimer: "Evidence readiness",
            credit: {
              status: "ready",
              modelVersion: "george-html-2026.09.1",
              financialProfile: null,
              profileConfidence: {
                label: "Low",
                confidenceScore: 10,
                coveragePct: 20,
                dataReliabilityQualityPct: 0,
                fieldsFilled: 5,
                fieldsTotal: 26,
              },
              missingReasons: {
                estimated_margin_pct:
                  "Verified supplier spending is not connected.",
              },
              integritySummary: [],
            },
          },
        ],
      },
    }),
  );
  await page.goto("/credit-assessment");
  await expect(
    page.getByText("Verified supplier spending is not connected.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Experimental credit risk", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Default probability", { exact: true }),
  ).toHaveCount(0);
});

test("merchant credit profile preserves cents and exposes separate pilot consent", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "mcbuse_portal_access",
      value: "test-only",
      url: "http://127.0.0.1:3101",
      httpOnly: true,
    },
    {
      name: "mcbuse_portal_csrf",
      value: "credit-profile-csrf",
      url: "http://127.0.0.1:3101",
    },
  ]);
  await page.route("**/api/merchant/me/evidence-readiness", (r) =>
    r.fulfill({
      json: {
        stage: "insufficient_evidence",
        measured: {
          observedDays: 0,
          activeDays: 0,
          finalizedPayments: 0,
          captureQualityPercent: 0,
          finalityPercent: 0,
        },
        passedRequirements: [],
        missingRequirements: ["More history"],
        disclaimer: "Evidence readiness only.",
      },
    }),
  );
  await page.route("**/api/merchant/me/consents", (r) =>
    r.fulfill({ json: { active: false, recordedAt: null } }),
  );
  await page.route("**/api/merchant/me/imports", (r) =>
    r.fulfill({ json: { items: [] } }),
  );
  await page.route("**/api/merchant/me/assessments", (r) =>
    r.fulfill({ json: { assessments: [] } }),
  );
  await page.route("**/api/merchant/me/finance-packages", (r) =>
    r.fulfill({ json: { items: [] } }),
  );
  // The credit profile lives in the Run credit assessment drawer as
  // "Additional information" and is saved by the single Run assessment action.
  await page.goto("/credit-assessment");
  await page
    .getByRole("button", { name: "Run credit assessment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Additional information", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Requested loan amount (EUR)", { exact: true })
    .fill("0.10");
  // Only the declaration save matters here; stop before the run itself.
  await page.route("**/api/merchant/me/assessments", (r) =>
    r.request().method() === "POST" ? r.abort() : r.fallback(),
  );
  const savedRequest = page.waitForRequest(
    (r) =>
      r.url().endsWith("/api/merchant/me/credit-profile") &&
      r.method() === "PATCH",
  );
  await page
    .getByLabel("Use my saved business records for this assessment", {
      exact: false,
    })
    .check();
  await page
    .getByRole("button", { name: "Run assessment", exact: true })
    .click();
  expect((await savedRequest).postDataJSON().data.loanAmountMinor).toBe("10");
  await expect(
    page.getByText("Internal pilot consent (optional)"),
  ).toHaveCount(0);
  await expect(
    page.getByText("Default probability", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
