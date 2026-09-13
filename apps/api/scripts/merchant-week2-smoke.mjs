import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({
  path: new URL('../.env', import.meta.url).pathname,
  quiet: true,
});

const managedApi = process.env.WEEK2_MANAGED_API === 'true';
const managedApiPort = 4011;
const baseUrl =
  process.env.WEEK2_API_URL ??
  `http://127.0.0.1:${managedApi ? managedApiPort : 4000}/api/v1`;
const databaseHost = process.env.DATABASE_HOST;

const apiHostname = new URL(baseUrl).hostname;
const localHostnames = new Set(['127.0.0.1', 'localhost', '::1']);
if (
  !localHostnames.has(apiHostname) ||
  !databaseHost ||
  !localHostnames.has(databaseHost)
) {
  throw new Error(
    'This smoke check is intentionally restricted to a local API and database.',
  );
}

const database = new pg.Client({
  host: databaseHost,
  port: Number(process.env.DATABASE_PORT ?? 5432),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
});

const runId = randomUUID().replaceAll('-', '').slice(0, 12);
const merchantEmail = `week2-merchant-${runId}@example.test`;
const merchantUsername = `week2_merchant_${runId}`;
const merchantPassword = `Week2-${randomUUID()}!Aa1`;
const payerEmail = `week2-payer-${runId}@example.test`;
const payerUsername = `week2_payer_${runId}`;
const payerPassword = `Week2-${randomUUID()}!Aa1`;
const descriptionPrefix = `Week 2 acceptance ${runId}`;

let merchantTokens;
let payerTokens;
let merchant;
let merchantUserId;
let merchantWalletIds = [];
let payerUserId;
let payerWalletIds = [];
const paymentRuns = [];
let failedPaymentRequestId;
let apiProcess;
let managedApiStarted = false;
let recoveredAfterRestart = false;

async function waitForProcessExit(child, timeoutMs = 5_000) {
  if (child.exitCode !== null || child.signalCode) return;
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    wait(timeoutMs).then(() => {
      if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL');
    }),
  ]);
}

async function stopManagedApi() {
  if (!apiProcess) return;
  const child = apiProcess;
  apiProcess = undefined;
  if (child.exitCode === null && !child.signalCode) child.kill('SIGTERM');
  await waitForProcessExit(child);
}

async function startManagedApi() {
  const appDirectory = new URL('..', import.meta.url).pathname;
  const entrypoint = new URL('../dist/src/main.js', import.meta.url).pathname;
  if (!existsSync(entrypoint)) {
    throw new Error(
      'Build the API before running merchant:week2-recovery-smoke.',
    );
  }
  if (!managedApiStarted) {
    try {
      const occupied = await fetch(`${baseUrl}/health`);
      if (occupied.ok) {
        throw new Error(`Port ${managedApiPort} is already serving an API.`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('already serving')) {
        throw error;
      }
    }
  }

  const recentLogs = [];
  apiProcess = spawn(process.execPath, ['dist/src/main.js'], {
    cwd: appDirectory,
    env: {
      ...process.env,
      PORT: String(managedApiPort),
      API_PREFIX: 'api/v1',
      TRANSFER_PROVIDER: 'mock',
      MERCHANT_PORTAL_ENABLED: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  managedApiStarted = true;
  const capture = (chunk) => {
    recentLogs.push(...String(chunk).trim().split('\n'));
    if (recentLogs.length > 20) recentLogs.splice(0, recentLogs.length - 20);
  };
  apiProcess.stdout.on('data', capture);
  apiProcess.stderr.on('data', capture);

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (apiProcess.exitCode !== null) {
      throw new Error(
        `Managed API exited during startup:\n${recentLogs.join('\n')}`,
      );
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await wait(200);
  }
  throw new Error(
    `Managed API did not become healthy:\n${recentLogs.join('\n')}`,
  );
}

async function waitForRequestStatus(token, requestId, expectedStatus) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const request = await api(`/merchants/me/payment-requests/${requestId}`, {
      token,
    });
    if (request.status === expectedStatus) return request;
    await wait(250);
  }
  throw new Error(
    `Payment request did not reach ${expectedStatus} after API restart.`,
  );
}

function decodeJti(token) {
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  const normalized = payload.replaceAll('-', '+').replaceAll('_', '/');
  return (
    JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')).jti ?? null
  );
}

async function api(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `${method} ${path} returned ${response.status}: ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

async function apiStatus(path, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  await response.arrayBuffer();
  return response.status;
}

async function apiMutationStatus(path, token, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  await response.arrayBuffer();
  return response.status;
}

async function query(text, values = []) {
  return database.query(text, values);
}

async function recoverAbandonedRuns() {
  await query('begin');
  try {
    const userRows = await query(
      "select id from users where email like 'week2-%@example.test'",
    );
    const userIds = userRows.rows.map((row) => row.id);
    if (!userIds.length) {
      await query('commit');
      return 0;
    }

    const walletRows = await query(
      'select id from wallets where user_id = any($1::uuid[])',
      [userIds],
    );
    const walletIds = walletRows.rows.map((row) => row.id);
    const merchantRows = walletIds.length
      ? await query(
          `select distinct id
             from merchants
            where receiving_wallet_id = any($1::uuid[])
               or id in (
                 select merchant_id
                   from merchant_memberships
                  where user_id = any($2::uuid[])
               )`,
          [walletIds, userIds],
        )
      : { rows: [] };
    const merchantIds = merchantRows.rows.map((row) => row.id);
    const requestRows = await query(
      `select distinct pr.id
         from payment_requests pr
         left join merchant_payment_attempts mpa on mpa.payment_request_id = pr.id
        where mpa.payer_user_id = any($1::uuid[])
           or pr.description like 'Week 2 acceptance %'`,
      [userIds],
    );
    const requestIds = requestRows.rows.map((row) => row.id);

    if (requestIds.length) {
      await query(
        'delete from merchant_capture_exceptions where payment_request_id = any($1::uuid[])',
        [requestIds],
      );
      await query(
        'delete from merchant_transactions where payment_request_id = any($1::uuid[])',
        [requestIds],
      );
      await query(
        'delete from merchant_payment_attempts where payment_request_id = any($1::uuid[])',
        [requestIds],
      );
      await query('delete from payment_requests where id = any($1::uuid[])', [
        requestIds,
      ]);
    }
    if (merchantIds.length) {
      await query(
        'delete from merchant_consent_records where merchant_id = any($1::uuid[])',
        [merchantIds],
      );
      await query(
        'delete from merchant_memberships where merchant_id = any($1::uuid[])',
        [merchantIds],
      );
      await query('delete from merchants where id = any($1::uuid[])', [
        merchantIds,
      ]);
    }
    if (walletIds.length) {
      await query(
        'delete from ledger_entries where debit_wallet_id = any($1::uuid[]) or credit_wallet_id = any($1::uuid[])',
        [walletIds],
      );
      await query('delete from balances where wallet_id = any($1::uuid[])', [
        walletIds,
      ]);
      await query('delete from wallets where id = any($1::uuid[])', [
        walletIds,
      ]);
    }
    await query('delete from refresh_tokens where user_id = any($1::uuid[])', [
      userIds,
    ]);
    await query('delete from users where id = any($1::uuid[])', [userIds]);
    await query('commit');
    return userIds.length;
  } catch (error) {
    await query('rollback');
    throw error;
  }
}

async function cleanup() {
  if (!database._connected) return;
  await query('begin');
  try {
    const paymentRequestIds = [
      ...paymentRuns.map((run) => run.requestId),
      failedPaymentRequestId,
    ].filter(Boolean);
    if (paymentRequestIds.length) {
      await query(
        'delete from merchant_capture_exceptions where payment_request_id = any($1::uuid[])',
        [paymentRequestIds],
      );
      await query(
        'delete from merchant_transactions where payment_request_id = any($1::uuid[])',
        [paymentRequestIds],
      );
      await query(
        'delete from merchant_payment_attempts where payment_request_id = any($1::uuid[])',
        [paymentRequestIds],
      );
      await query('delete from payment_requests where id = any($1::uuid[])', [
        paymentRequestIds,
      ]);
    }
    if (merchant?.id) {
      await query(
        'delete from merchant_consent_records where merchant_id = $1',
        [merchant.id],
      );
      await query('delete from merchant_memberships where merchant_id = $1', [
        merchant.id,
      ]);
      await query('delete from merchants where id = $1', [merchant.id]);
    }

    const walletIds = [...merchantWalletIds, ...payerWalletIds];
    if (walletIds.length) {
      await query(
        'delete from ledger_entries where debit_wallet_id = any($1::uuid[]) or credit_wallet_id = any($1::uuid[])',
        [walletIds],
      );
      await query('delete from balances where wallet_id = any($1::uuid[])', [
        walletIds,
      ]);
      await query('delete from wallets where id = any($1::uuid[])', [
        walletIds,
      ]);
    }

    const userIds = [merchantUserId, payerUserId].filter(Boolean);
    if (userIds.length) {
      await query(
        'delete from refresh_tokens where user_id = any($1::uuid[])',
        [userIds],
      );
      await query('delete from users where id = any($1::uuid[])', [userIds]);
    }

    const tokenJtis = [
      decodeJti(merchantTokens?.refreshToken),
      decodeJti(payerTokens?.refreshToken),
    ].filter(Boolean);
    if (tokenJtis.length && !userIds.length) {
      await query('delete from refresh_tokens where jti = any($1::uuid[])', [
        tokenJtis,
      ]);
    }
    await query('commit');
  } catch (error) {
    await query('rollback');
    throw error;
  }
}

try {
  await database.connect();
  const recoveredRuns = await recoverAbandonedRuns();
  if (recoveredRuns) {
    console.log(`Recovered ${recoveredRuns} abandoned Week 2 smoke run(s).`);
  }
  if (managedApi) await startManagedApi();

  merchantTokens = await api('/auth/signup', {
    method: 'POST',
    body: {
      email: merchantEmail,
      password: merchantPassword,
      firstName: 'Week',
      lastName: 'Two Merchant',
      username: merchantUsername,
    },
  });
  const merchantUserRows = await query(
    `select u.id as user_id, w.id as wallet_id, w.type
       from users u
       join wallets w on w.user_id = u.id
      where u.email = $1`,
    [merchantEmail],
  );
  merchantUserId = merchantUserRows.rows[0]?.user_id;
  merchantWalletIds = merchantUserRows.rows.map((row) => row.wallet_id);
  const receivingWalletId = merchantUserRows.rows.find(
    (row) => row.type === 'routine',
  )?.wallet_id;
  if (!merchantUserId || !receivingWalletId) {
    throw new Error('Temporary merchant wallet setup failed.');
  }
  const merchantRows = await query(
    `insert into merchants
      (public_id, business_name, timezone, display_currency,
       receiving_wallet_id, is_active)
     values ($1, 'Week 2 Test Merchant', 'Europe/Berlin', 'EUR', $2, true)
     returning id, receiving_wallet_id`,
    [`week2_${runId}`, receivingWalletId],
  );
  merchant = merchantRows.rows[0];
  await query(
    `insert into merchant_memberships (merchant_id, user_id, role)
     values ($1, $2, 'owner')`,
    [merchant.id, merchantUserId],
  );
  const merchantProfile = await api('/merchants/me', {
    token: merchantTokens.accessToken,
  });
  const summaryBefore = await api('/merchants/me/summary?period=30d', {
    token: merchantTokens.accessToken,
  });

  payerTokens = await api('/auth/signup', {
    method: 'POST',
    body: {
      email: payerEmail,
      password: payerPassword,
      firstName: 'Week',
      lastName: 'Two',
      username: payerUsername,
    },
  });
  const payerRow = await query(
    'select id from users where email = $1 limit 1',
    [payerEmail],
  );
  payerUserId = payerRow.rows[0]?.id;
  if (!payerUserId) throw new Error('Temporary payer was not persisted.');
  const walletRows = await query('select id from wallets where user_id = $1', [
    payerUserId,
  ]);
  payerWalletIds = walletRows.rows.map((row) => row.id);
  const payerCannotAccessMerchant =
    (await apiStatus('/merchants/me', payerTokens.accessToken)) === 403;

  await api('/onramp', {
    token: payerTokens.accessToken,
    method: 'POST',
    body: { amount: '5000000', currency: 'USDC' },
  });
  await api('/wallets/transfer', {
    token: payerTokens.accessToken,
    method: 'POST',
    body: {
      fromWalletType: 'savings',
      toWalletType: 'routine',
      amount: '5000000',
      currency: 'USDC',
    },
  });

  for (let index = 1; index <= 3; index += 1) {
    const description = `${descriptionPrefix} ${index}`;
    const idempotencyKey = randomUUID();
    const request = await api('/merchants/me/payment-requests', {
      token: merchantTokens.accessToken,
      method: 'POST',
      body: { amountMinor: '100', description },
    });
    const nonce = new URL(request.qrPayload).searchParams.get('nonce');
    if (!nonce) {
      throw new Error('Merchant QR payload did not contain a nonce.');
    }
    const run = {
      description,
      idempotencyKey,
      requestId: request.id,
      nonce,
    };
    paymentRuns.push(run);

    if (index === 2) {
      const firstRun = paymentRuns[0];
      run.reusedKeyDifferentNonceStatus = await apiMutationStatus(
        '/payments',
        payerTokens.accessToken,
        { nonce, idempotencyKey: firstRun.idempotencyKey },
      );
    }
    run.pendingTransactions = await api(
      `/merchants/me/transactions?query=${encodeURIComponent(description)}`,
      { token: merchantTokens.accessToken },
    );
    const quoteRows = await query(
      `select display_amount_minor, display_currency, quote_rate_scaled, quoted_at
         from payment_requests
        where id = $1`,
      [request.id],
    );
    run.persistedQuote = quoteRows.rows[0];

    if (managedApi && index === 1) {
      await stopManagedApi();
      await query('begin');
      try {
        const claimed = await query(
          `update payment_requests
              set status = 'processing', processing_at = now()
            where id = $1 and status = 'pending'
          returning id`,
          [request.id],
        );
        if (claimed.rowCount !== 1) {
          throw new Error(
            'Could not prepare a submitted payment for recovery.',
          );
        }
        await query(
          `insert into merchant_payment_attempts
            (payment_request_id, payer_user_id, idempotency_key, status,
             submitted_signature, claimed_at, submitted_at, updated_at)
           values ($1, $2, $3, 'submitted', $4, now(), now(), now())`,
          [request.id, payerUserId, idempotencyKey, `mock_recovery_${runId}`],
        );
        const reserved = await query(
          `update balances b
              set available = b.available - pr.amount,
                  pending = b.pending + pr.amount,
                  updated_at = now()
             from payment_requests pr, wallets w
            where pr.id = $1
              and w.user_id = $2
              and w.type = 'routine'
              and b.wallet_id = w.id
              and b.currency = pr.currency
              and b.available >= pr.amount
          returning b.id`,
          [request.id, payerUserId],
        );
        if (reserved.rowCount !== 1) {
          throw new Error('Could not reserve funds for recovery rehearsal.');
        }
        await query('commit');
      } catch (error) {
        await query('rollback');
        throw error;
      }
      await startManagedApi();
      await waitForRequestStatus(
        merchantTokens.accessToken,
        request.id,
        'completed',
      );
      recoveredAfterRestart = true;
    }

    run.payment = await api('/payments', {
      token: payerTokens.accessToken,
      method: 'POST',
      body: { nonce, idempotencyKey },
    });
    run.retry = await api('/payments', {
      token: payerTokens.accessToken,
      method: 'POST',
      body: { nonce, idempotencyKey },
    });
    if (index === 1) {
      run.crossPayerIdempotencyStatus = await apiMutationStatus(
        '/payments',
        merchantTokens.accessToken,
        { nonce, idempotencyKey },
      );
    }
    run.requestAfter = await api(
      `/merchants/me/payment-requests/${request.id}`,
      { token: merchantTokens.accessToken },
    );
  }

  let failedRequestAfter = null;
  if (managedApi) {
    const failedRequest = await api('/merchants/me/payment-requests', {
      token: merchantTokens.accessToken,
      method: 'POST',
      body: {
        amountMinor: '100',
        description: `${descriptionPrefix} pre-broadcast failure`,
      },
    });
    failedPaymentRequestId = failedRequest.id;
    const failedIdempotencyKey = randomUUID();
    await stopManagedApi();
    await query('begin');
    try {
      const claimed = await query(
        `update payment_requests
            set status = 'processing', processing_at = now() - interval '6 minutes'
          where id = $1 and status = 'pending'
        returning id`,
        [failedRequest.id],
      );
      if (claimed.rowCount !== 1) {
        throw new Error('Could not prepare the failed recovery request.');
      }
      await query(
        `insert into merchant_payment_attempts
          (payment_request_id, payer_user_id, idempotency_key, status,
           claimed_at, updated_at)
         values ($1, $2, $3, 'processing',
                 now() - interval '6 minutes', now() - interval '6 minutes')`,
        [failedRequest.id, payerUserId, failedIdempotencyKey],
      );
      const reserved = await query(
        `update balances b
            set available = b.available - pr.amount,
                pending = b.pending + pr.amount,
                updated_at = now()
           from payment_requests pr, wallets w
          where pr.id = $1
            and w.user_id = $2
            and w.type = 'routine'
            and b.wallet_id = w.id
            and b.currency = pr.currency
            and b.available >= pr.amount
        returning b.id`,
        [failedRequest.id, payerUserId],
      );
      if (reserved.rowCount !== 1) {
        throw new Error('Could not reserve the failed recovery funds.');
      }
      await query('commit');
    } catch (error) {
      await query('rollback');
      throw error;
    }
    await startManagedApi();
    failedRequestAfter = await waitForRequestStatus(
      merchantTokens.accessToken,
      failedRequest.id,
      'failed',
    );
  }

  await query(
    `insert into merchant_capture_exceptions
      (merchant_id, payment_request_id, reason_code, severity, status, details)
     values ($1, $2, 'reconciliation_delayed', 'warning', 'open', $3)`,
    [
      merchant.id,
      paymentRuns[0].requestId,
      'internal customer wallet detail must never reach the merchant',
    ],
  );
  const transactions = await api(
    `/merchants/me/transactions?query=${encodeURIComponent(descriptionPrefix)}`,
    { token: merchantTokens.accessToken },
  );
  const summaryAfter = await api('/merchants/me/summary?period=30d', {
    token: merchantTokens.accessToken,
  });
  const paymentRequestIds = paymentRuns.map((run) => run.requestId);
  const canonicalCount = await query(
    'select count(*)::int as value from merchant_transactions where payment_request_id = any($1::uuid[])',
    [paymentRequestIds],
  );
  const attemptCount = await query(
    'select count(*)::int as value from merchant_payment_attempts where payment_request_id = any($1::uuid[])',
    [paymentRequestIds],
  );
  const ledgerCount = await query(
    'select count(*)::int as value from ledger_entries where payment_request_id = any($1::uuid[])',
    [paymentRequestIds],
  );
  const failedAttempt = failedPaymentRequestId
    ? await query(
        `select status, error_code
           from merchant_payment_attempts
          where payment_request_id = $1`,
        [failedPaymentRequestId],
      )
    : { rows: [] };
  const settlement = await query(
    `select coalesce(sum(settlement_amount), 0)::text as total
       from merchant_transactions
      where payment_request_id = any($1::uuid[])`,
    [paymentRequestIds],
  );
  const merchantBalance = await query(
    "select available::text, pending::text from balances where wallet_id = $1 and currency = 'USDC' limit 1",
    [merchant.receiving_wallet_id],
  );
  const payerRoutineBalance = await query(
    `select b.available::text, b.pending::text
       from balances b
       join wallets w on w.id = b.wallet_id
      where w.user_id = $1 and w.type = 'routine' and b.currency = 'USDC'
      limit 1`,
    [payerUserId],
  );

  const settlementTotal = BigInt(settlement.rows[0]?.total ?? '0');
  const assertions = {
    merchantProfileIsFiatFirst:
      merchantProfile.displayCurrency === 'EUR' &&
      !('receivingWalletId' in merchantProfile),
    payerCannotAccessMerchant,
    pendingExcludedFromReceipts: paymentRuns.every(
      (run) => run.pendingTransactions.totalItems === 0,
    ),
    quotesPersisted: paymentRuns.every(
      (run) =>
        run.persistedQuote?.display_amount_minor === '100' &&
        run.persistedQuote?.display_currency === 'EUR' &&
        BigInt(run.persistedQuote?.quote_rate_scaled ?? 0) > 0n &&
        Boolean(run.persistedQuote?.quoted_at),
    ),
    requestsCompleted: paymentRuns.every(
      (run) => run.requestAfter.status === 'completed',
    ),
    idempotentRetries: paymentRuns.every(
      (run) =>
        run.payment.paymentRequestId === run.retry.paymentRequestId &&
        run.payment.idempotencyKey === run.retry.idempotencyKey,
    ),
    idempotencyBoundToPayerAndRequest:
      paymentRuns[0].crossPayerIdempotencyStatus === 400 &&
      paymentRuns[1].reusedKeyDifferentNonceStatus === 400,
    exactlyThreeCanonicalTransactions:
      canonicalCount.rows[0]?.value === 3 &&
      attemptCount.rows[0]?.value === 3 &&
      ledgerCount.rows[0]?.value === 3,
    merchantReceiptVisible:
      transactions.totalItems === 3 &&
      transactions.items.every((item) => item.amount?.minor === '100'),
    summaryUpdated:
      summaryBefore.paymentCount30Days === 0 &&
      summaryAfter.receivedToday.minor === '300' &&
      summaryAfter.received30Days.minor === '300' &&
      summaryAfter.paymentCount30Days === 3 &&
      summaryAfter.averageSale.minor === '100',
    qualityUpdated:
      summaryAfter.captureQualityPercent === 100 &&
      Boolean(summaryAfter.lastCapturedAt),
    safeActionableProblem:
      summaryAfter.problemCount === (managedApi ? 2 : 1) &&
      summaryAfter.problems.some(
        (problem) => problem.code === 'payment_delayed',
      ) &&
      (!managedApi ||
        summaryAfter.problems.some(
          (problem) => problem.code === 'payment_failed',
        )) &&
      !JSON.stringify(summaryAfter).includes('customer wallet detail'),
    noBlockchainFieldsInReceipt:
      transactions.items.length === 3 &&
      transactions.items.every(
        (item) => !('solanaTxSignature' in item) && !('walletAddress' in item),
      ),
    exactlyOnceBalanceMovement:
      BigInt(merchantBalance.rows[0]?.available ?? '0') === settlementTotal &&
      BigInt(merchantBalance.rows[0]?.pending ?? '0') === 0n &&
      BigInt(payerRoutineBalance.rows[0]?.available ?? '0') ===
        5_000_000n - settlementTotal &&
      BigInt(payerRoutineBalance.rows[0]?.pending ?? '0') === 0n,
    ...(managedApi
      ? {
          recoveredAfterRestart,
          failedReservationReleased:
            failedRequestAfter?.status === 'failed' &&
            failedAttempt.rows[0]?.status === 'failed' &&
            failedAttempt.rows[0]?.error_code === 'transfer_failed',
        }
      : {}),
  };

  const failed = Object.entries(assertions).filter(([, passed]) => !passed);
  if (failed.length) {
    throw new Error(
      `Acceptance assertions failed: ${failed.map(([name]) => name).join(', ')}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        result: 'passed',
        transport: managedApi ? 'local mock with API restart' : 'local mock',
        payments: 3,
        amountEach: 'EUR 1.00',
        assertions,
      },
      null,
      2,
    ),
  );
} finally {
  try {
    await stopManagedApi();
    await cleanup();
  } finally {
    if (database._connected) await database.end();
  }
}
