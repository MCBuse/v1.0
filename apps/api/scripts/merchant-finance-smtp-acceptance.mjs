import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import pg from 'pg';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function argumentsFor(name) {
  return process.argv.flatMap((value, index) =>
    value === `--${name}` && process.argv[index + 1]
      ? [process.argv[index + 1].trim().toLowerCase()]
      : [],
  );
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function main() {
  const projectId = process.env.MCBUSE_GCP_PROJECT_ID?.trim();
  const apiBaseUrl = argument('api-base-url')?.replace(/\/$/, '');
  const recipients = [...new Set(argumentsFor('recipient'))];
  const skipEmail = process.argv.includes('--skip-email');
  const checkCashIdempotency = process.argv.includes('--check-cash-idempotency');
  const checkPackageIdempotency = process.argv.includes('--check-package-idempotency');
  const outputRoot = resolve(argument('output-dir') ?? 'output/merchant-finance-smtp-acceptance');
  if (!projectId || !apiBaseUrl || (!skipEmail && !recipients.length)) {
    throw new Error('Usage: MCBUSE_GCP_PROJECT_ID=... node scripts/merchant-finance-smtp-acceptance.mjs --api-base-url https://api.example/api/v1 --recipient inbox@example.test [--recipient second@example.test] [--skip-email]');
  }
  if (recipients.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error('Every recipient must be a valid email address');
  }

  const runId = randomUUID().replaceAll('-', '').slice(0, 16);
  const testEmail = `finance-smtp-${runId}@example.test`;
  const password = `Finance-${randomUUID()}Aa!`;
  const username = `finance_smtp_${runId.slice(0, 12)}`;
  const artifactDirectory = resolve(outputRoot, runId);
  const database = new pg.Client(databaseConfig(secret(projectId, 'DATABASE_URL')));

  await database.connect();
  try {
    const signup = await request(apiBaseUrl, '/auth/signup', {
      method: 'POST',
      body: {
        email: testEmail,
        password,
        firstName: 'Finance',
        lastName: 'SMTP Demonstration',
        username,
      },
    });
    const tokens = await signup.json();
    const accessToken = tokens.accessToken;
    if (!accessToken) throw new Error('Test merchant signup did not return an access token');

    const walletResult = await database.query(
      `select u.id as user_id, w.id as wallet_id
         from users u
         join wallets w on w.user_id = u.id
        where u.email = $1 and w.type = 'routine' and w.is_active = true
        limit 1`,
      [testEmail],
    );
    const owner = walletResult.rows[0];
    if (!owner) throw new Error('Test merchant routine wallet was not created');
    const merchantResult = await database.query(
      `insert into merchants
        (public_id, business_name, timezone, display_currency, receiving_wallet_id, is_active)
       values ($1, $2, 'Africa/Accra', 'EUR', $3, true)
       returning id`,
      [`demo_${runId}`, 'MCBuse SMTP Demonstration Merchant', owner.wallet_id],
    );
    const merchantId = merchantResult.rows[0]?.id;
    if (!merchantId) throw new Error('Test merchant could not be provisioned');
    await database.query(
      `insert into merchant_memberships (merchant_id, user_id, role)
       values ($1, $2, 'owner')`,
      [merchantId, owner.user_id],
    );

    await request(apiBaseUrl, '/merchants/me/consents', {
      token: accessToken,
      method: 'POST',
      body: { active: true },
    });
    const saleTimes = [
      new Date(Date.now() - 2 * 60 * 60 * 1000),
      new Date(Date.now() - 90 * 60 * 1000),
      new Date(Date.now() - 45 * 60 * 1000),
    ];
    const lines = [
      { name: 'Demonstration cash sale A', unitPriceMinor: '850', quantity: 1 },
      { name: 'Demonstration cash sale B', unitPriceMinor: '1200', quantity: 2 },
      { name: 'Demonstration cash sale C', unitPriceMinor: '375', quantity: 3 },
    ];
    for (const [index, line] of lines.entries()) {
      await request(apiBaseUrl, '/merchants/me/cash-sales', {
        token: accessToken,
        method: 'POST',
        headers: { 'idempotency-key': `${runId}-sale-${index}` },
        body: {
          occurredAt: saleTimes[index].toISOString(),
          description: 'Demonstration data - SMTP finance package acceptance',
          lines: [{ type: 'custom', ...line }],
        },
      });
    }
    let cashSaleIdempotencyVerified = false;
    if (checkCashIdempotency) {
      const idempotencyKey = `${runId}-idempotency`;
      const idempotencyBody = {
        occurredAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        description: 'Demonstration data - idempotency verification',
        lines: [{ type: 'custom', name: 'Idempotency test sale', unitPriceMinor: '250', quantity: 1 }],
      };
      const first = await request(apiBaseUrl, '/merchants/me/cash-sales', {
        token: accessToken, method: 'POST', headers: { 'idempotency-key': idempotencyKey }, body: idempotencyBody,
      });
      const replay = await request(apiBaseUrl, '/merchants/me/cash-sales', {
        token: accessToken, method: 'POST', headers: { 'idempotency-key': idempotencyKey }, body: idempotencyBody,
      });
      if ((await first.json()).id !== (await replay.json()).id) {
        throw new Error('Identical cash-sale idempotency replay did not return the original sale');
      }
      try {
        await request(apiBaseUrl, '/merchants/me/cash-sales', {
          token: accessToken, method: 'POST', headers: { 'idempotency-key': idempotencyKey },
          body: { ...idempotencyBody, lines: [{ type: 'custom', name: 'Idempotency test sale', unitPriceMinor: '275', quantity: 1 }] },
        });
        throw new Error('Changed cash-sale input unexpectedly reused an idempotency key');
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('returned 409')) throw error;
      }
      cashSaleIdempotencyVerified = true;
    }
    const created = await request(apiBaseUrl, '/merchants/me/finance-packages', {
      token: accessToken,
      method: 'POST',
      headers: { 'idempotency-key': `${runId}-package` },
      body: { periodDays: 7, demonstrationData: true },
    });
    const pkg = await created.json();
    if (!pkg?.id || pkg?.snapshot?.demonstrationData !== true) {
      throw new Error('Generated package is not marked as demonstration data');
    }
    let packageIdempotencyVerified = false;
    if (checkPackageIdempotency) {
      const replay = await request(apiBaseUrl, '/merchants/me/finance-packages', {
        token: accessToken, method: 'POST', headers: { 'idempotency-key': `${runId}-package` },
        body: { periodDays: 7, demonstrationData: true },
      });
      if ((await replay.json()).id !== pkg.id) {
        throw new Error('Identical finance-package replay did not return the original package');
      }
      try {
        await request(apiBaseUrl, '/merchants/me/finance-packages', {
          token: accessToken, method: 'POST', headers: { 'idempotency-key': `${runId}-package` },
          body: { periodDays: 30, demonstrationData: true },
        });
        throw new Error('Changed finance-package input unexpectedly reused an idempotency key');
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('returned 409')) throw error;
      }
      packageIdempotencyVerified = true;
    }
    const [pdfResponse, zipResponse] = await Promise.all([
      request(apiBaseUrl, `/merchants/me/finance-packages/${pkg.id}/pdf`, { token: accessToken }),
      request(apiBaseUrl, `/merchants/me/finance-packages/${pkg.id}/data`, { token: accessToken }),
    ]);
    const [pdf, zip] = await Promise.all([
      Buffer.from(await pdfResponse.arrayBuffer()),
      Buffer.from(await zipResponse.arrayBuffer()),
    ]);
    if (!pdf.byteLength || !zip.byteLength) throw new Error('Package download returned an empty artifact');
    await mkdir(artifactDirectory, { recursive: true });
    const pdfPath = resolve(artifactDirectory, `mcbuse-evidence-${pkg.id}.pdf`);
    const zipPath = resolve(artifactDirectory, `mcbuse-evidence-${pkg.id}.zip`);
    await Promise.all([writeFile(pdfPath, pdf), writeFile(zipPath, zip)]);
    const attempts = [];
    for (const recipientEmail of skipEmail ? [] : recipients) {
      const response = await request(apiBaseUrl, `/merchants/me/finance-packages/${pkg.id}/email`, {
        token: accessToken,
        method: 'POST',
        headers: { 'idempotency-key': `${runId}-email-${attempts.length}` },
        body: {
          recipientEmail,
          institutionName: 'MCBuse SMTP acceptance test',
          confirmed: true,
        },
      });
      const attempt = await response.json();
      attempts.push(attempt.status);
    }
    process.stdout.write(`${JSON.stringify({
      runId,
      testMerchantEmail: testEmail,
      packageId: pkg.id,
      demonstrationData: pkg.snapshot.demonstrationData,
      artifacts: {
        pdf: { path: pdfPath, bytes: pdf.byteLength, sha256: sha256(pdf) },
        zip: { path: zipPath, bytes: zip.byteLength, sha256: sha256(zip) },
      },
      recipientCount: recipients.length,
      attemptStatuses: attempts,
      cashSaleIdempotencyVerified,
      packageIdempotencyVerified,
    }, null, 2)}\n`);
  } finally {
    await database.end();
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'SMTP finance acceptance failed';
  process.stderr.write(`${message.replaceAll(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url-redacted]')}\n`);
  process.exitCode = 1;
});
