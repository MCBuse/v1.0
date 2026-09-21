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

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (request.method === "GET" && url.pathname === "/api/v1/health") {
    return send(response, 200, { status: "ok" });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/auth/login") {
    const body = await readJson(request).catch(() => ({}));
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

  if (request.method === "GET" && url.pathname === "/api/v1/merchants/me") {
    if (bearer(request) === "consumer-access")
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
