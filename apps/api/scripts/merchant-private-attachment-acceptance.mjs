import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';

const DEMONSTRATION_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL2YQAAAABJRU5ErkJggg==',
  'base64',
);

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function secret(projectId, name) {
  return execFileSync(
    'gcloud',
    ['secrets', 'versions', 'access', 'latest', `--secret=${name}`, `--project=${projectId}`],
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

async function request(apiBaseUrl, path, { token, method = 'GET', body, headers } = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} returned ${response.status}: ${text.slice(0, 300)}`);
  }
  return response;
}

async function createMerchant(apiBaseUrl, database, runId, label) {
  const email = `attachment-${label}-${runId}@example.test`;
  const signup = await request(apiBaseUrl, '/auth/signup', {
    method: 'POST',
    body: {
      email,
      password: `Attachment-${randomUUID()}Aa!`,
      firstName: 'Attachment',
      lastName: 'Acceptance',
      username: `attachment_${label}_${runId.slice(0, 8)}`,
    },
  });
  const tokens = await signup.json();
  if (!tokens?.accessToken) throw new Error('Test merchant signup did not return an access token');
  const owner = (await database.query(
    `select u.id as user_id, w.id as wallet_id
       from users u join wallets w on w.user_id = u.id
      where u.email = $1 and w.type = 'routine' and w.is_active = true
      limit 1`,
    [email],
  )).rows[0];
  if (!owner) throw new Error('Test merchant routine wallet was not created');
  const merchant = (await database.query(
    `insert into merchants
      (public_id, business_name, timezone, display_currency, receiving_wallet_id, is_active)
     values ($1, $2, 'Africa/Accra', 'EUR', $3, true)
     returning id`,
    [`attachment_${label}_${runId.slice(0, 8)}`, 'MCBuse attachment demonstration merchant', owner.wallet_id],
  )).rows[0];
  await database.query(
    'insert into merchant_memberships (merchant_id, user_id, role) values ($1, $2, $3)',
    [merchant.id, owner.user_id, 'owner'],
  );
  return { accessToken: tokens.accessToken };
}

async function main() {
  const projectId = process.env.MCBUSE_GCP_PROJECT_ID?.trim();
  const apiBaseUrl = argument('api-base-url')?.replace(/\/$/, '');
  if (!projectId || !apiBaseUrl) {
    throw new Error('Usage: MCBUSE_GCP_PROJECT_ID=... node scripts/merchant-private-attachment-acceptance.mjs --api-base-url https://api.example/api/v1');
  }
  const runId = randomUUID().replaceAll('-', '').slice(0, 16);
  const database = new pg.Client(databaseConfig(secret(projectId, 'DATABASE_URL')));
  await database.connect();
  try {
    const [owner, unrelatedMerchant] = await Promise.all([
      createMerchant(apiBaseUrl, database, runId, 'owner'),
      createMerchant(apiBaseUrl, database, runId, 'other'),
    ]);
    const sale = await request(apiBaseUrl, '/merchants/me/cash-sales', {
      token: owner.accessToken,
      method: 'POST',
      headers: { 'idempotency-key': `${runId}-cash-sale` },
      body: {
        occurredAt: new Date().toISOString(),
        description: 'Demonstration data - private attachment acceptance',
        lines: [{ type: 'custom', name: 'Attachment acceptance sale', unitPriceMinor: '100', quantity: 1 }],
      },
    });
    const cashSale = await sale.json();
    if (!cashSale?.id) throw new Error('Cash sale did not return an identifier');
    const form = new FormData();
    form.set('file', new Blob([DEMONSTRATION_PNG], { type: 'image/png' }), 'demonstration-support.png');
    const uploaded = await fetch(`${apiBaseUrl}/merchants/me/cash-sales/${cashSale.id}/attachment`, {
      method: 'POST',
      headers: { authorization: `Bearer ${owner.accessToken}` },
      body: form,
    });
    if (!uploaded.ok) throw new Error(`Attachment upload returned ${uploaded.status}: ${(await uploaded.text()).slice(0, 300)}`);
    const metadata = await uploaded.json();
    const [downloaded, unrelatedDownload] = await Promise.all([
      fetch(`${apiBaseUrl}/merchants/me/cash-sales/${cashSale.id}/attachment`, {
        headers: { authorization: `Bearer ${owner.accessToken}` },
      }),
      fetch(`${apiBaseUrl}/merchants/me/cash-sales/${cashSale.id}/attachment`, {
        headers: { authorization: `Bearer ${unrelatedMerchant.accessToken}` },
      }),
    ]);
    if (!downloaded.ok) throw new Error(`Attachment download returned ${downloaded.status}`);
    const contents = Buffer.from(await downloaded.arrayBuffer());
    if (!contents.equals(DEMONSTRATION_PNG)) throw new Error('Downloaded attachment bytes differ from the uploaded document');
    if (unrelatedDownload.status !== 404) throw new Error(`Unrelated merchant attachment download returned ${unrelatedDownload.status}, expected 404`);
    process.stdout.write(`${JSON.stringify({
      runId,
      cashSaleId: cashSale.id,
      upload: {
        contentType: metadata.contentType,
        byteSize: metadata.byteSize,
        originalName: metadata.originalName,
      },
      download: {
        contentType: downloaded.headers.get('content-type'),
        contentDisposition: downloaded.headers.get('content-disposition'),
        bytes: contents.byteLength,
        sha256: createHash('sha256').update(contents).digest('hex'),
      },
      unrelatedMerchantRejected: unrelatedDownload.status === 404,
    }, null, 2)}\n`);
  } finally {
    await database.end();
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Private attachment acceptance failed';
  process.stderr.write(`${message.replaceAll(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url-redacted]')}\n`);
  process.exitCode = 1;
});
