import { expect, test } from "@playwright/test";

const QUOTED_AT = "2026-09-21T08:00:00.000Z";
const CONVERSION_NOTE =
  "This is a conversion of a USDC balance at the quoted rate, not a euro balance you are owed.";

function accountsSummary(
  overrides: { holdingAvailableCents?: string; routinePendingCents?: string } = {},
) {
  return {
    accounts: [
      {
        account: "holding",
        name: "Holding account",
        purpose: "Where money rests between taking it and using it.",
        availableCents: overrides.holdingAvailableCents ?? "125000",
        pendingCents: "0",
        settlement: {
          currency: "USDC",
          availableBaseUnits: "1250000000",
          pendingBaseUnits: "0",
        },
        converted: {
          currency: "EUR",
          availableMinor: "115000",
          rate: 0.92,
          quotedAt: QUOTED_AT,
          note: CONVERSION_NOTE,
        },
        actions: ["Add money", "Move money", "Withdraw"],
        recentActivity: [
          {
            id: "act-1",
            kind: "funding_card",
            description: "Card top-up",
            direction: "in",
            amountCents: "50000",
            occurredAt: "2026-09-20T10:15:00.000Z",
            status: "finalized",
            reference: null,
          },
        ],
      },
      {
        account: "routine",
        name: "Routine account",
        purpose: "Day-to-day takings and spending.",
        availableCents: "48000",
        pendingCents: overrides.routinePendingCents ?? "2500",
        settlement: {
          currency: "USDC",
          availableBaseUnits: "480000000",
          pendingBaseUnits: "25000000",
        },
        converted: {
          currency: "EUR",
          availableMinor: "44160",
          rate: 0.92,
          quotedAt: QUOTED_AT,
          note: CONVERSION_NOTE,
        },
        actions: ["Pay", "Move money"],
        recentActivity: [],
      },
    ],
    today: {
      businessDate: "2026-09-21",
      timezone: "Europe/Berlin",
      digitalReceiptsCents: "32000",
      digitalReceiptCount: 7,
      cashRecordedCents: "9500",
      cashRecordedCount: 3,
      note: "Today's receipts are shown separately from what is spendable now.",
    },
    custody: {
      network: "Solana devnet",
      model: "Balances are held by MCBuse on your behalf in custodial wallets.",
      note: "You never need to hold SOL or choose a network; MCBuse pays network fees.",
    },
  };
}

function dayEndView(movedCents = "0") {
  return {
    businessDate: "2026-09-21",
    timezone: "Europe/Berlin",
    routine: { availableCents: "48000", pendingCents: "2500" },
    today: {
      digitalReceiptsCents: "32000",
      digitalReceiptCount: 7,
      cashRecordedMinor: "9500",
      cashRecordedCurrency: "EUR",
      cashRecordedCount: 3,
    },
    previousTransfers:
      movedCents === "0"
        ? []
        : [
            {
              operationId: "op-day-end",
              amountCents: movedCents,
              status: "finalized",
              confirmedAt: "2026-09-21T17:00:00.000Z",
              chainSignature: "sig-day-end",
              actorUserId: "user-9",
            },
          ],
    suggestion: {
      amountCents: "32000",
      cappedBy: "todays_receipts",
      explanation:
        "Capped by today's digital receipts, which are lower than the available balance.",
    },
    cashNote:
      "Cash is recorded for your records and is not part of this transfer: it has no digital balance to move.",
  };
}

const payoutDestinations = {
  configured: true,
  payoutsEnabled: true,
  destinations: [
    {
      id: "ba_test_1",
      kind: "bank",
      label: "Test Bank account",
      last4: "6789",
      eligible: true,
      methods: ["standard"],
    },
    {
      id: "card_blocked",
      kind: "card",
      label: "Expired card",
      last4: "0000",
      eligible: false,
      reason: "card_expired",
    },
  ],
  problems: [],
};

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
  await page.route("**/api/accounts/payout-destinations**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(payoutDestinations),
    }),
  );
  await page.route("**/api/accounts/day-end**", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(dayEndView()),
    });
  });
  await page.route("**/api/accounts/", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(accountsSummary()),
    });
  });
  await page.route("**/api/merchant/me/payment-requests**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        page: 1,
        pageSize: 10,
        totalItems: 0,
        totalPages: 1,
      }),
    }),
  );
  await page.route("**/api/merchant/me/products**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        page: 1,
        pageSize: 100,
        totalItems: 0,
        totalPages: 1,
      }),
    }),
  );
});

test("A.1–A.3 — both accounts appear with their balances and activity", async ({
  page,
}) => {
  await page.goto("/payment");

  await expect(
    page.getByRole("heading", { name: "Holding account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Routine account" }),
  ).toBeVisible();
  // en-IE renders USD as "US$".
  await expect(page.getByText("US$1,250.00").first()).toBeVisible();
  await expect(page.getByText("US$480.00").first()).toBeVisible();
  await expect(page.getByText("Card top-up")).toBeVisible();
});

test("A.2 — pending money is shown as not yet spendable", async ({ page }) => {
  await page.goto("/payment");
  await expect(page.getByText("pending, not yet spendable")).toBeVisible();
  await expect(page.getByText("Nothing pending")).toBeVisible();
});

test("A.4 — today's receipts are separate from what is spendable", async ({
  page,
}) => {
  await page.goto("/payment");
  await expect(page.getByText("Digital receipts today")).toBeVisible();
  await expect(page.getByText("US$320.00").first()).toBeVisible();
  await expect(
    page.getByText("Today's receipts are shown separately from what is spendable now."),
  ).toBeVisible();
});

test("A.5 and A.10 — the euro figure is labelled as a conversion, not an entitlement", async ({
  page,
}) => {
  await page.goto("/payment");
  await expect(page.getByText("quoted 21 Sept 2026", { exact: false })).toHaveCount(2);
  await expect(page.getByText(CONVERSION_NOTE).first()).toBeVisible();
});

test("A.6 — the actions are named as the plan names them", async ({ page }) => {
  await page.goto("/payment");
  await expect(page.getByRole("button", { name: "Add money" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move money" })).toHaveCount(2);
});

test("A.7 and A.8 — no token, network, address or seed phrase is asked for", async ({
  page,
}) => {
  await page.goto("/payment");
  const body = (await page.locator("body").textContent()) ?? "";
  for (const forbidden of [
    "seed phrase",
    "Seed phrase",
    "recovery phrase",
    "paste address",
    "Choose a network",
    "Select token",
  ]) {
    expect(body).not.toContain(forbidden);
  }
  // The amount field is the only input in the money flows.
  await page.getByRole("button", { name: "Add money" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox")).toHaveCount(1);
});

test("A.9 — custody, fees and conversion stay reachable", async ({ page }) => {
  await page.goto("/payment");
  await page
    .getByRole("button", { name: /How this is held/ })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Solana devnet")).toBeVisible();
  await expect(
    dialog.getByText("MCBuse pays network fees", { exact: false }),
  ).toBeVisible();
  await expect(dialog.getByText("1250000000 base units", { exact: false })).toBeVisible();
});

test("a transfer sends the amount, the direction and an idempotency key", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one submission proof is enough");

  const requests: Array<{ body: unknown; key: string | undefined }> = [];
  await page.route("**/api/accounts/transfers", (route) => {
    requests.push({
      body: JSON.parse(route.request().postData() ?? "{}"),
      key: route.request().headers()["idempotency-key"],
    });
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        operationId: "op-1",
        status: "reserved",
        amountCents: "2500",
        replayed: false,
      }),
    });
  });

  await page.goto("/payment");
  await page.getByRole("button", { name: "Move money" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill("25.00");
  await dialog.getByRole("button", { name: "Move money" }).click();

  await expect.poll(() => requests.length).toBe(1);
  const [transfer] = requests;
  expect(transfer!.body).toEqual({
    from: "holding",
    to: "routine",
    amountCents: "2500",
  });
  expect(transfer!.key).toMatch(/^[0-9a-f-]{36}$/);
});

test("a withdrawal offers only eligible destinations", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  await page.goto("/payment");
  await page.getByRole("button", { name: "Withdraw" }).click();
  const dialog = page.getByRole("dialog");
  // Options inside a native select are not "visible" to Playwright, so the
  // assertion is on what the list contains.
  const select = dialog.getByLabel("Send to");
  await expect(select.getByRole("option")).toHaveCount(2);
  await expect(select).toContainText("Test Bank account ••6789");
  await expect(select).not.toContainText("Expired card");
});

test("an amount of zero is refused before anything is sent", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one proof is enough");

  let sent = 0;
  await page.route("**/api/accounts/transfers", (route) => {
    sent += 1;
    return route.fulfill({ status: 201, body: "{}" });
  });

  await page.goto("/payment");
  await page.getByRole("button", { name: "Move money" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Move money" }).click();
  await expect(
    dialog.getByText("Enter an amount greater than zero."),
  ).toBeVisible();
  expect(sent).toBe(0);
});

test("E.1–E.7 — the day-end panel shows the figures and the limit that bound them", async ({
  page,
}) => {
  await page.goto("/payment");

  const dayEnd = page.getByRole("region", { name: "End of day" });
  await expect(dayEnd.getByRole("heading", { name: "End of day" })).toBeVisible();
  await expect(
    dayEnd.getByText("Today's digital receipts", { exact: true }),
  ).toBeVisible();
  await expect(dayEnd.getByText("Available in Routine")).toBeVisible();
  await expect(dayEnd.getByText("Cash recorded today")).toBeVisible();
  await expect(dayEnd.getByText("€95.00")).toBeVisible();
  await expect(
    dayEnd.getByText("Capped by today's digital receipts", { exact: false }),
  ).toBeVisible();
  await expect(
    dayEnd.getByText("Cash is recorded for your records", { exact: false }),
  ).toBeVisible();
});

test("E.5 — the suggested amount is editable and the merchant's number is sent", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one submission proof is enough");

  const bodies: unknown[] = [];
  await page.route("**/api/accounts/day-end", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(dayEndView()),
      });
    bodies.push(JSON.parse(route.request().postData() ?? "{}"));
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        operationId: "op-day-end",
        status: "reserved",
        amountCents: "10000",
        replayed: false,
      }),
    });
  });

  await page.goto("/payment");
  const amount = page.getByLabel("Amount to move");
  await expect(amount).toHaveValue("320.00");
  await amount.fill("100.00");
  await page.getByRole("button", { name: "Move to Holding" }).click();

  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toEqual({
    amountCents: "10000",
    businessDate: "2026-09-21",
  });
  await expect(
    page.getByText("US$100.00 is moving from Routine to Holding"),
  ).toBeVisible();
});

test("a failed accounts read says so instead of showing zero balances", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one state proof is enough");

  await page.unroute("**/api/accounts/");
  await page.route("**/api/accounts/", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Service unavailable" }),
    }),
  );

  await page.goto("/payment");
  await expect(
    page.getByText("Account balances could not be loaded."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByText("US$0.00")).toHaveCount(0);
});
