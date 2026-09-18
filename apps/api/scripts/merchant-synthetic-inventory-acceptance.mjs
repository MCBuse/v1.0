import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import pg from 'pg';

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

async function main() {
  const projectId = process.env.MCBUSE_GCP_PROJECT_ID?.trim();
  const apiBaseUrl = argument('api-base-url')?.replace(/\/$/, '');
  if (!projectId || !apiBaseUrl) {
    throw new Error('Usage: MCBUSE_GCP_PROJECT_ID=... node scripts/merchant-synthetic-inventory-acceptance.mjs --api-base-url https://api.example/api/v1');
  }
  const runId = randomUUID().replaceAll('-', '').slice(0, 16);
  const fixture = await readFile(new URL('../../../docs/fixtures/synthetic-inventory-export.csv', import.meta.url));
  const email = `inventory-${runId}@example.test`;
  const database = new pg.Client(databaseConfig(secret(projectId, 'DATABASE_URL')));
  await database.connect();
  try {
    const signup = await request(apiBaseUrl, '/auth/signup', {
      method: 'POST',
      body: {
        email,
        password: `Inventory-${randomUUID()}Aa!`,
        firstName: 'Inventory',
        lastName: 'Acceptance',
        username: `inventory_${runId.slice(0, 8)}`,
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
      [`inventory_${runId.slice(0, 8)}`, 'MCBuse synthetic inventory demonstration merchant', owner.wallet_id],
    )).rows[0];
    await database.query(
      'insert into merchant_memberships (merchant_id, user_id, role) values ($1, $2, $3)',
      [merchant.id, owner.user_id, 'owner'],
    );

    const form = new FormData();
    form.set('kind', 'inventory');
    form.set('sourceName', 'Synthetic fixture - demonstration only');
    form.set('applyStockSnapshot', 'true');
    form.set('file', new Blob([fixture], { type: 'text/csv' }), 'synthetic-inventory-export.csv');
    const previewResponse = await fetch(`${apiBaseUrl}/merchants/me/imports/preview`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      body: form,
    });
    if (!previewResponse.ok) throw new Error(`Inventory preview returned ${previewResponse.status}: ${(await previewResponse.text()).slice(0, 300)}`);
    const preview = await previewResponse.json();
    if (!preview.canCommit || preview.rowCount !== 6 || preview.errors?.length) throw new Error('Synthetic inventory preview was not valid for commit');
    const commit = await request(apiBaseUrl, `/merchants/me/imports/${preview.id}/commit`, {
      token: tokens.accessToken,
      method: 'POST',
      headers: { 'idempotency-key': `${runId}-inventory-import` },
    });
    const committed = await commit.json();
    if (committed.status !== 'committed' || committed.imported !== 6) throw new Error('Synthetic inventory import did not commit all six rows');

    const replayForm = new FormData();
    replayForm.set('kind', 'inventory');
    replayForm.set('sourceName', 'Synthetic fixture - demonstration only');
    replayForm.set('applyStockSnapshot', 'true');
    replayForm.set('file', new Blob([fixture], { type: 'text/csv' }), 'synthetic-inventory-export.csv');
    const replayResponse = await fetch(`${apiBaseUrl}/merchants/me/imports/preview`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      body: replayForm,
    });
    if (!replayResponse.ok) throw new Error(`Repeated inventory preview returned ${replayResponse.status}`);
    const replay = await replayResponse.json();
    if (!replay.duplicate || replay.id !== preview.id || replay.canCommit) throw new Error('Repeated synthetic import did not safely reuse the committed batch');

    const products = await request(apiBaseUrl, '/merchants/me/products?query=DEMO-COF-250', { token: tokens.accessToken });
    const product = (await products.json()).items?.find((item) => item.sku === 'DEMO-COF-250');
    if (!product || product.onHandQuantity !== 36 || product.availableQuantity !== 36) throw new Error('Imported coffee product does not have the expected opening stock');
    const sale = await request(apiBaseUrl, '/merchants/me/cash-sales', {
      token: tokens.accessToken,
      method: 'POST',
      headers: { 'idempotency-key': `${runId}-sale` },
      body: {
        occurredAt: new Date().toISOString(),
        description: 'Demonstration data - imported inventory sale',
        lines: [{ type: 'product', productId: product.id, quantity: 2 }],
      },
    });
    const cashSale = await sale.json();
    const analytics = await request(apiBaseUrl, `/merchants/me/products/${product.id}/analytics?period=7d`, { token: tokens.accessToken });
    const productAnalytics = await analytics.json();
    if (productAnalytics.onHandQuantity !== 34 || productAnalytics.availableQuantity !== 34 || productAnalytics.quantitySold !== 2 || productAnalytics.cashQuantity !== 2) {
      throw new Error('Imported product analytics or stock did not reflect the synthetic sale');
    }
    process.stdout.write(`${JSON.stringify({
      runId,
      import: { id: preview.id, importedRows: committed.imported, repeatedUploadWasDuplicate: replay.duplicate },
      sale: { id: cashSale.id, productId: product.id, quantity: 2 },
      product: {
        sku: product.sku,
        openingOnHand: 36,
        onHandAfterSale: productAnalytics.onHandQuantity,
        quantitySold: productAnalytics.quantitySold,
        cashQuantity: productAnalytics.cashQuantity,
      },
    }, null, 2)}\n`);
  } finally {
    await database.end();
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Synthetic inventory acceptance failed';
  process.stderr.write(`${message.replaceAll(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url-redacted]')}\n`);
  process.exitCode = 1;
});
