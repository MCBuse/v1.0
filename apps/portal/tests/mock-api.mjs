import { creditPilotMock } from './credit-pilot-mock.mjs';
import { createServer } from "node:http";
import process from "node:process";

const host = "127.0.0.1";
const port = 4011;

function send(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(payload === undefined ? undefined : JSON.stringify(payload));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}

function bearer(request) {
  return request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
}

function isMerchantAccess(token) {
  return ["test-only", "merchant-access", "refreshed-access"].includes(token);
}


/** The request currently on the counter, so the display has something to show. */
let presentedRequest = {
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

/** Requests the UI made, so a test can assert what was actually sent. */
const recorded = [];
let dayEndMoved = 0n;

function accountsSummary() {
  const quotedAt = "2026-09-21T08:00:00.000Z";
  const note =
    "This is a conversion of a USDC balance at the quoted rate, not a euro balance you are owed.";
  return {
    accounts: [
      {
        account: "holding",
        name: "Holding account",
        purpose: "Where money rests between taking it and using it.",
        availableCents: "125000",
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
          quotedAt,
          note,
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
        pendingCents: "2500",
        settlement: {
          currency: "USDC",
          availableBaseUnits: "480000000",
          pendingBaseUnits: "25000000",
        },
        converted: {
          currency: "EUR",
          availableMinor: "44160",
          rate: 0.92,
          quotedAt,
          note,
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

function dayEndView() {
  const suggested = 32000n - dayEndMoved;
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
      dayEndMoved > 0n
        ? [
            {
              operationId: "00000000-0000-4000-8000-0000000000d1",
              amountCents: dayEndMoved.toString(),
              status: "finalized",
              confirmedAt: "2026-09-21T17:00:00.000Z",
              chainSignature: "sig-day-end",
              actorUserId: "00000000-0000-4000-8000-000000000009",
            },
          ]
        : [],
    suggestion: {
      amountCents: (suggested > 0n ? suggested : 0n).toString(),
      cappedBy: "todays_receipts",
      explanation:
        "Capped by today's digital receipts, which are lower than the available balance.",
    },
    cashNote:
      "Cash is recorded for your records and is not part of this transfer: it has no digital balance to move.",
  };
}


/** A small but complete General Analytics payload for browser tests. */
function generalAnalytics() {
  const share = (amount, total) =>
    total === 0 ? 0 : Math.round((amount / total) * 10000) / 100;
  const digital = 32000;
  const cash = 9500;
  const total = digital + cash;
  return {
    transactions: {
      range: {
        from: "2026-08-22T00:00:00.000Z",
        to: "2026-09-21T00:00:00.000Z",
        timezone: "Europe/Berlin",
        grouping: "day",
      },
      totals: {
        salesMinor: String(total),
        transactionCount: 10,
        averageTransactionMinor: String(Math.round(total / 10)),
      },
      bySource: {
        digital: {
          amountMinor: String(digital),
          count: 7,
          amountSharePercent: share(digital, total),
          countSharePercent: 70,
        },
        cash: {
          amountMinor: String(cash),
          count: 3,
          amountSharePercent: share(cash, total),
          countSharePercent: 30,
        },
      },
      byPaymentMethod: [
        {
          method: "mcbuse_wallet",
          amountMinor: String(digital),
          count: 7,
          amountSharePercent: share(digital, total),
        },
        {
          method: "cash",
          amountMinor: String(cash),
          count: 3,
          amountSharePercent: share(cash, total),
        },
      ],
      series: [
        {
          periodStart: "2026-09-19",
          periodEnd: "2026-09-19",
          label: "2026-09-19",
          amountMinor: "15000",
          count: 4,
          averageMinor: "3750",
          partial: false,
        },
        {
          periodStart: "2026-09-20",
          periodEnd: "2026-09-20",
          label: "2026-09-20",
          amountMinor: "18000",
          count: 5,
          averageMinor: "3600",
          partial: false,
        },
        {
          periodStart: "2026-09-21",
          periodEnd: "2026-09-21",
          label: "2026-09-21",
          amountMinor: "8500",
          count: 1,
          averageMinor: "8500",
          partial: true,
        },
      ],
      hourly: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        amountMinor: hour === 12 ? "20000" : hour === 13 ? "12000" : "0",
        count: hour === 12 ? 6 : hour === 13 ? 4 : 0,
      })),
      peakHour: { hour: 12, amountMinor: "20000", count: 6 },
      busiestWindow: {
        startHour: 11,
        endHour: 13,
        amountMinor: "32000",
        count: 10,
        amountSharePercent: 77.11,
      },
      tradingWindow: { firstHour: 12, lastHour: 13 },
      trends: {
        sales: {
          current: undefined,
          previous: undefined,
          currentMinor: String(total),
          previousMinor: "30000",
          changePercent: 38.33,
          baselineAvailable: true,
        },
        transactionCount: {
          current: 10,
          previous: 8,
          changePercent: 25,
          baselineAvailable: true,
        },
        averageValue: {
          current: undefined,
          previous: undefined,
          currentMinor: "4150",
          previousMinor: "3750",
          changePercent: 10.67,
          baselineAvailable: true,
        },
      },
      labels: {
        partialPeriod: true,
        missingBaseline: false,
        notes: [
          "The most recent period is still in progress, so its figures will continue to change.",
        ],
      },
    },
    inventory: {
      range: {
        from: "2026-08-22",
        to: "2026-09-21",
        days: 31,
        timezone: "Europe/Berlin",
      },
      position: {
        onHandQuantity: 42,
        reservedQuantity: 3,
        availableQuantity: 39,
      },
      valuation: {
        atSellingPriceMinor: "21000",
        basis: "current_selling_price",
        note: "Valued at current selling prices. This is not purchase cost and is not a profit or margin figure.",
      },
      movementsByKind: [
        { kind: "restock", quantity: 30, entries: 2 },
        { kind: "cash_sale", quantity: -12, entries: 12 },
      ],
      stock: [
        ...Array.from({ length: 14 }, (_, index) => ({
          productId: `product-${index}`,
          name: `Product ${String(index).padStart(2, "0")}`,
          category: index % 2 ? "Bakery" : "Hot Drinks",
          unitsSold: 20 - index,
          unitsPerDay: Math.round(((20 - index) / 31) * 10000) / 10000,
          onHandQuantity: 5 + index,
          reservedQuantity: 0,
          availableQuantity: 5 + index,
          lowStockThreshold: 3,
        })),
        {
          productId: "product-unsold",
          name: "Dusty item",
          category: null,
          unitsSold: 0,
          unitsPerDay: 0,
          onHandQuantity: 9,
          reservedQuantity: 0,
          availableQuantity: 9,
          lowStockThreshold: 2,
        },
      ],
      fastMoving: Array.from({ length: 14 }, (_, index) => ({
        productId: `product-${index}`,
        name: `Product ${String(index).padStart(2, "0")}`,
        unitsSold: 20 - index,
        unitsPerDay: Math.round(((20 - index) / 31) * 10000) / 10000,
        onHandQuantity: 5 + index,
        lowStockThreshold: 3,
      })),
      slowMoving: [],
      stockedButUnsold: [
        {
          productId: "product-unsold",
          name: "Dusty item",
          unitsSold: 0,
          unitsPerDay: 0,
          onHandQuantity: 9,
          lowStockThreshold: 2,
        },
      ],
      atOrBelowMinimum: [
        {
          productId: "product-low",
          name: "Nearly gone",
          unitsSold: 4,
          unitsPerDay: 0.13,
          onHandQuantity: 2,
          lowStockThreshold: 3,
        },
      ],
      approachingMinimum: [],
      currentStockOuts: [
        {
          productId: "product-out",
          name: "Sold out beans",
          unitsSold: 6,
          unitsPerDay: 0.19,
          onHandQuantity: 0,
          lowStockThreshold: 2,
        },
      ],
      historicalStockOuts: [
        {
          productId: "product-out",
          name: "Sold out beans",
          intervals: [
            { from: "2026-09-18", to: "2026-09-21", days: 4, ongoing: true },
          ],
          totalDays: 4,
          eligible: true,
          reason: null,
        },
        {
          productId: "product-unknown",
          name: "Imported item",
          intervals: [],
          totalDays: 0,
          eligible: false,
          reason:
            "Opening stock for this period cannot be established from recorded movements.",
        },
      ],
      turnover: [
        {
          productId: "product-0",
          name: "Product 00",
          unitsSold: 20,
          averageDailyOnHand: 8.5,
          turnoverRatio: 2.3529,
          eligible: true,
          reason: null,
        },
        {
          productId: "product-unknown",
          name: "Imported item",
          unitsSold: 3,
          averageDailyOnHand: null,
          turnoverRatio: null,
          eligible: false,
          reason:
            "Opening stock for this period cannot be established from recorded movements.",
        },
      ],
      byCategory: [
        {
          category: "Hot Drinks",
          unitsSold: 18,
          amountMinor: "24000",
          productCount: 3,
          categorySource: "recorded",
        },
        {
          category: "Retail",
          unitsSold: 6,
          amountMinor: "17500",
          productCount: 2,
          categorySource: "current_product",
        },
      ],
      notes: [
        "Stock-out history is only reconstructed for products whose recorded movements support it.",
      ],
    },
    combined: {
      analyses: [
        {
          id: "sales_versus_stock",
          title: "Sales against stock",
          explanation:
            "Recorded sales came to 415.00 across 10 transactions, covering 24 units. Stock rose over the same period, opening at 24 and closing at 42, with 30 units restocked, a net change of 18.",
          figures: [
            { key: "revenueMinor", label: "Recorded sales", value: "41500", unit: "minor_currency" },
            { key: "unitsSold", label: "Units sold", value: "24", unit: "units" },
          ],
          reliable: true,
          caveats: [],
        },
        {
          id: "trading_concentration",
          title: "Trading concentration",
          explanation:
            "The busiest three hours were 11:00 to 14:00, taking 320.00 across 10 transactions.",
          figures: [
            { key: "windowStartHour", label: "Window start", value: "11", unit: "hour" },
          ],
          reliable: true,
          caveats: [],
        },
        {
          id: "volume_versus_value",
          title: "Volume against value",
          explanation:
            "Transactions rose 25% and revenue rose 38.33%. Both the number of sales and the size of each sale grew.",
          figures: [
            { key: "revenueChangePercent", label: "Revenue change", value: "38.33", unit: "percent" },
          ],
          reliable: true,
          caveats: [],
        },
        {
          id: "velocity_versus_availability",
          title: "Selling speed against availability",
          explanation:
            "Product 00 sold 20 units, about 0.645 a day. There are 5 on hand against a reorder level of 3.",
          figures: [
            { key: "daysOfCoverRemaining", label: "Days of cover", value: "3.1", unit: "days" },
          ],
          reliable: true,
          caveats: [],
        },
      ],
      stockScopeNote:
        "Stock figures cover all stock, not a filtered subset. Sales figures follow the filters you have applied.",
      generatedBy: "deterministic-rules-v1",
    },
    filters: { source: "all", environment: "all", applied: false },
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (await creditPilotMock(request,response,url,{send,readJson,bearer})) return;

  if (request.method === "GET" && url.pathname === "/api/v1/health") {
    return send(response, 200, { status: "ok" });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/auth/login") {
    const body = await readJson(request).catch(() => ({}));
    if (body.email === 'analyst@example.test' && body.password === 'analyst-password') return send(response,200,{accessToken:'staff-access',refreshToken:'staff-refresh'});
    if (
      body.email === "merchant@example.test" &&
      body.password === "merchant-password"
    )
      return send(response, 200, {
        accessToken: "merchant-access",
        refreshToken: "merchant-refresh",
      });
    if (
      body.email === "consumer@example.test" &&
      body.password === "consumer-password"
    )
      return send(response, 200, {
        accessToken: "consumer-access",
        refreshToken: "consumer-refresh",
      });
    return send(response, 401, { message: "Unauthorized" });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/auth/refresh") {
    const body = await readJson(request).catch(() => ({}));
    if (body.refreshToken === 'staff-refresh') return send(response,200,{accessToken:'staff-refreshed',refreshToken:'staff-refresh'});
    if (["merchant-refresh", "expired-refresh"].includes(body.refreshToken))
      return send(response, 200, {
        accessToken: "refreshed-access",
        refreshToken: "refreshed-refresh",
      });
    return send(response, 401, { message: "Unauthorized" });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/auth/logout") {
    return send(response, 204);
  }


  // ── Account flows ─────────────────────────────────────────────────────────
  // Enough of the real shapes for the portal to be exercised in a browser
  // without a database. The money movements record what they were asked to do
  // so a test can assert the request the UI actually sent.

  if (request.method === "GET" && url.pathname === "/api/v1/accounts") {
    if (!isMerchantAccess(bearer(request)))
      return send(response, 401, { message: "Unauthorized" });
    return send(response, 200, accountsSummary());
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/accounts/payout-destinations"
  ) {
    if (!isMerchantAccess(bearer(request)))
      return send(response, 401, { message: "Unauthorized" });
    return send(response, 200, {
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
          id: "card_test_1",
          kind: "card",
          label: "Visa debit",
          last4: "4242",
          eligible: true,
          methods: ["instant", "standard"],
        },
      ],
      problems: [],
    });
  }

  if (request.method === "GET" && url.pathname === "/api/v1/accounts/day-end") {
    if (!isMerchantAccess(bearer(request)))
      return send(response, 401, { message: "Unauthorized" });
    return send(response, 200, dayEndView());
  }

  if (
    request.method === "POST" &&
    ["/api/v1/accounts/funding", "/api/v1/accounts/transfers", "/api/v1/accounts/withdrawals", "/api/v1/accounts/day-end"].includes(url.pathname)
  ) {
    if (!isMerchantAccess(bearer(request)))
      return send(response, 401, { message: "Unauthorized" });
    if (!request.headers["idempotency-key"])
      return send(response, 400, {
        message: "Idempotency-Key header is required",
      });
    const body = await readJson(request);
    recorded.push({ path: url.pathname, body });
    if (url.pathname === "/api/v1/accounts/funding")
      return send(response, 201, {
        operationId: "00000000-0000-4000-8000-0000000000f1",
        status: "collection_pending",
        checkoutUrl: "http://127.0.0.1:4011/checkout/test-session",
        amountCents: body.amountCents,
        method: body.method,
        replayed: false,
      });
    if (url.pathname === "/api/v1/accounts/day-end") {
      dayEndMoved += BigInt(body.amountCents ?? "0");
      return send(response, 201, {
        operationId: "00000000-0000-4000-8000-0000000000d1",
        status: "reserved",
        amountCents: body.amountCents,
        replayed: false,
      });
    }
    return send(response, 201, {
      operationId: "00000000-0000-4000-8000-0000000000t1",
      status: "reserved",
      amountCents: body.amountCents,
      replayed: false,
    });
  }

  if (request.method === "GET" && url.pathname === "/api/v1/__recorded") {
    return send(response, 200, { recorded });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/merchants/me/presented-request"
  ) {
    if (!isMerchantAccess(bearer(request)))
      return send(response, 401, { message: "Unauthorized" });
    return send(response, 200, { request: presentedRequest, latestSequence: "12" });
  }

  if (
    request.method === "DELETE" &&
    url.pathname === "/api/v1/merchants/me/presented-request"
  ) {
    presentedRequest = null;
    return send(response, 200, { cleared: true });
  }

  if (request.method === "GET" && url.pathname === "/api/v1/merchants/me/events") {
    if (!isMerchantAccess(bearer(request)))
      return send(response, 401, { message: "Unauthorized" });
    return send(response, 200, { events: [], latestSequence: "12" });
  }

  if (request.method === "GET" && url.pathname === "/api/v1/merchants/me") {
    if (["consumer-access", "staff-access", "staff-refreshed"].includes(bearer(request)))
      return send(response, 403, {
        message: "Merchant access is not provisioned",
      });
    if (!isMerchantAccess(bearer(request)))
      return send(response, 401, { message: "Unauthorized" });
    return send(response, 200, {
      id: "00000000-0000-4000-8000-000000000001",
      businessName: "Test Merchant",
      timezone: "Europe/Berlin",
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/merchants/me/analytics/general"
  ) {
    if (!isMerchantAccess(bearer(request)))
      return send(response, 401, { message: "Unauthorized" });
    return send(response, 200, generalAnalytics());
  }

  if (request.method === "GET" && url.pathname === "/api/v1/merchants/me/products") {
    if (!isMerchantAccess(bearer(request)))
      return send(response, 401, { message: "Unauthorized" });
    return send(response, 200, {
      items: [],
      page: 1,
      pageSize: 100,
      totalItems: 0,
      totalPages: 1,
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/merchants/me/payment-requests"
  ) {
    if (!isMerchantAccess(bearer(request)))
      return send(response, 401, { message: "Unauthorized" });
    return send(response, 200, {
      items: [],
      page: 1,
      pageSize: 10,
      totalItems: 0,
      totalPages: 1,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/merchants/me/invoices") {
    if (!isMerchantAccess(bearer(request)))
      return send(response, 401, { message: "Unauthorized" });
    const body = await readJson(request);
    return send(response, 201, {
      id: "00000000-0000-4000-8000-000000000002",
      invoiceNumber: "INV-CSRF-RECOVERY",
      description: body.description ?? null,
      lines: body.lines,
      amount: { currency: "EUR", minor: "1000" },
      status: "pending",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      qrPayload: "mcbuse://pay/test-csrf-recovery",
      completedAt: null,
      createdAt: new Date().toISOString(),
    });
  }

  return send(response, 404, { message: "Not found" });
});

server.listen(port, host, () => {
  process.stdout.write(`Portal test API listening on http://${host}:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
