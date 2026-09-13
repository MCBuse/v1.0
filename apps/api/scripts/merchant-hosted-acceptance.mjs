import { execFileSync } from 'node:child_process';
import process from 'node:process';
import pg from 'pg';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function readSecret(projectId, name) {
  return execFileSync(
    'gcloud',
    [
      'secrets',
      'versions',
      'access',
      'latest',
      `--secret=${name}`,
      `--project=${projectId}`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

function databaseConfig(connectionString) {
  const value = new URL(connectionString);
  return {
    host: value.hostname,
    port: Number(value.port || 5432),
    user: decodeURIComponent(value.username),
    password: decodeURIComponent(value.password),
    database: decodeURIComponent(value.pathname.slice(1)),
    ssl: { rejectUnauthorized: false },
  };
}

function literalLikePrefix(value) {
  return `${value.replaceAll(/([\\%_])/g, '\\$1')}%`;
}

function isDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

async function main() {
  const projectId = process.env.MCBUSE_GCP_PROJECT_ID?.trim();
  const merchantEmail = argument('merchant-email')?.toLowerCase();
  const descriptionPrefix = argument('description-prefix');
  const expectedPayments = Number(argument('expected-payments') ?? '3');

  if (!projectId || !merchantEmail || !descriptionPrefix) {
    throw new Error(
      'Usage: MCBUSE_GCP_PROJECT_ID=... pnpm --filter api merchant:hosted-acceptance -- --merchant-email merchant@example.com --description-prefix "Week 2 live run"',
    );
  }
  if (
    !Number.isSafeInteger(expectedPayments) ||
    expectedPayments < 1 ||
    expectedPayments > 20
  ) {
    throw new Error('expected-payments must be an integer from 1 to 20');
  }

  const databaseUrl = readSecret(projectId, 'DATABASE_URL');
  const database = new pg.Client(databaseConfig(databaseUrl));
  await database.connect();
  try {
    const merchantResult = await database.query(
      `select m.id as merchant_id, u.id as owner_user_id
         from users u
         join merchant_memberships mm
           on mm.user_id = u.id
          and mm.role = 'owner'
         join merchants m
           on m.id = mm.merchant_id
          and m.is_active = true
        where lower(u.email) = $1
          and u.is_active = true
          and u.deleted_at is null
        limit 1`,
      [merchantEmail],
    );
    const merchant = merchantResult.rows[0];
    if (!merchant) throw new Error('Active merchant owner was not found');

    const result = await database.query(
      `select pr.id as payment_request_id,
              pr.status as request_status,
              pr.display_amount_minor::text as request_display_minor,
              pr.display_currency as request_display_currency,
              pr.amount::text as request_settlement_minor,
              pr.currency as request_settlement_currency,
              pr.quote_rate_scaled::text as request_quote_rate_scaled,
              pr.quoted_at,
              pr.processing_at,
              pr.completed_at,
              pr.ledger_entry_id as request_ledger_entry_id,
              mpa.payer_user_id,
              mpa.status as attempt_status,
              mpa.idempotency_key,
              mpa.claimed_at,
              mpa.submitted_signature,
              mpa.submitted_at,
              mpa.finalized_at as attempt_finalized_at,
              mt.status as transaction_status,
              mt.ledger_entry_id as transaction_ledger_entry_id,
              mt.display_amount_minor::text as transaction_display_minor,
              mt.display_currency as transaction_display_currency,
              mt.settlement_amount::text as transaction_settlement_minor,
              mt.settlement_currency as transaction_settlement_currency,
              mt.quote_rate_scaled::text as transaction_quote_rate_scaled,
              mt.finalized_at as transaction_finalized_at,
              le.id as ledger_entry_id,
              le.status as ledger_status,
              le.solana_tx_signature,
              le.payment_request_id as ledger_payment_request_id,
              (select count(*)::int
                 from merchant_payment_attempts attempts
                where attempts.payment_request_id = pr.id) as attempt_count,
              (select count(*)::int
                 from merchant_transactions transactions
                where transactions.payment_request_id = pr.id) as transaction_count,
              (select count(*)::int
                 from ledger_entries entries
                where entries.payment_request_id = pr.id) as ledger_count
         from payment_requests pr
         left join merchant_payment_attempts mpa
           on mpa.payment_request_id = pr.id
         left join merchant_transactions mt
           on mt.payment_request_id = pr.id
         left join ledger_entries le
           on le.id = pr.ledger_entry_id
        where pr.merchant_id = $1
          and pr.description like $2 escape '\\'
        order by pr.created_at desc
        limit $3`,
      [
        merchant.merchant_id,
        literalLikePrefix(descriptionPrefix),
        expectedPayments + 1,
      ],
    );
    const rows = result.rows;

    const exactlyExpectedRequests = rows.length === expectedPayments;
    const finalizedState =
      exactlyExpectedRequests &&
      rows.every(
        (row) =>
          row.request_status === 'completed' &&
          row.attempt_status === 'finalized' &&
          row.transaction_status === 'finalized' &&
          row.ledger_status === 'completed' &&
          isDate(row.submitted_at) &&
          isDate(row.attempt_finalized_at) &&
          isDate(row.transaction_finalized_at) &&
          isDate(row.completed_at),
      );
    const exactlyOnce =
      exactlyExpectedRequests &&
      rows.every(
        (row) =>
          row.attempt_count === 1 &&
          row.transaction_count === 1 &&
          row.ledger_count === 1 &&
          row.request_ledger_entry_id === row.transaction_ledger_entry_id &&
          row.request_ledger_entry_id === row.ledger_entry_id &&
          row.ledger_payment_request_id === row.payment_request_id,
      );
    const distinctIdempotencyKeys =
      exactlyExpectedRequests &&
      rows.every((row) => Boolean(row.idempotency_key)) &&
      new Set(rows.map((row) => row.idempotency_key)).size === expectedPayments;
    const separatePayer =
      exactlyExpectedRequests &&
      rows.every(
        (row) =>
          Boolean(row.payer_user_id) &&
          row.payer_user_id !== merchant.owner_user_id,
      );
    const realDevnetSignatures =
      exactlyExpectedRequests &&
      rows.every(
        (row) =>
          Boolean(row.submitted_signature) &&
          row.submitted_signature === row.solana_tx_signature &&
          /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(row.submitted_signature),
      );
    const lockedEurQuotes =
      exactlyExpectedRequests &&
      rows.every(
        (row) =>
          row.request_display_currency === 'EUR' &&
          row.transaction_display_currency === 'EUR' &&
          BigInt(row.request_display_minor ?? '0') > 0n &&
          row.request_display_minor === row.transaction_display_minor &&
          BigInt(row.request_settlement_minor ?? '0') > 0n &&
          row.request_settlement_minor === row.transaction_settlement_minor &&
          row.request_settlement_currency === 'USDC' &&
          row.transaction_settlement_currency === 'USDC' &&
          BigInt(row.request_quote_rate_scaled ?? '0') > 0n &&
          row.request_quote_rate_scaled === row.transaction_quote_rate_scaled &&
          isDate(row.quoted_at),
      );
    const temporalEvidence =
      exactlyExpectedRequests &&
      rows.every(
        (row) =>
          isDate(row.quoted_at) &&
          isDate(row.processing_at) &&
          isDate(row.claimed_at) &&
          isDate(row.submitted_at) &&
          isDate(row.attempt_finalized_at) &&
          isDate(row.completed_at) &&
          row.quoted_at.getTime() <= row.processing_at.getTime() &&
          row.claimed_at.getTime() <= row.submitted_at.getTime() &&
          row.submitted_at.getTime() <= row.attempt_finalized_at.getTime() &&
          row.attempt_finalized_at.getTime() === row.completed_at.getTime(),
      );

    const checks = {
      exactlyExpectedRequests,
      finalizedState,
      exactlyOnce,
      distinctIdempotencyKeys,
      separatePayer,
      realDevnetSignatures,
      lockedEurQuotes,
      temporalEvidence,
    };
    const ready = Object.values(checks).every(Boolean);
    const eurMinorTotal = rows
      .reduce(
        (total, row) => total + BigInt(row.transaction_display_minor ?? '0'),
        0n,
      )
      .toString();
    const finalizedTimes = rows
      .map((row) => row.transaction_finalized_at)
      .filter(isDate)
      .sort((left, right) => left.getTime() - right.getTime());

    process.stdout.write(
      `${JSON.stringify(
        {
          projectId,
          network: 'devnet',
          expectedPayments,
          matchedRequests: rows.length,
          checks,
          evidence: {
            eurMinorTotal,
            firstFinalizedAt: finalizedTimes[0]?.toISOString() ?? null,
            lastFinalizedAt: finalizedTimes.at(-1)?.toISOString() ?? null,
          },
          ready,
        },
        null,
        2,
      )}\n`,
    );
    if (!ready) process.exitCode = 2;
  } finally {
    await database.end();
  }
}

void main().catch((error) => {
  const message =
    error instanceof Error ? error.message : 'Hosted acceptance check failed';
  process.stderr.write(
    `${message.replaceAll(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url-redacted]')}\n`,
  );
  process.exitCode = 1;
});
