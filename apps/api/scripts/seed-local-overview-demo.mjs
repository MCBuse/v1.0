#!/usr/bin/env node
/**
 * Seeds a merchant account with a realistic café trading history so the
 * Overview, analytics, readiness and credit-evidence views have data to work
 * with. By default about 70% of sales are digital MCBuse payments and the
 * rest are merchant-recorded cash.
 *
 *   SEED_EMAIL=you@example.com SEED_PASSWORD='…' \
 *     node scripts/seed-local-overview-demo.mjs \
 *       [--api http://localhost:4000/api/v1] [--days 32] \
 *       [--allow-host api.mcbuse.com] [--manifest ./seed-manifest.json] [--undo]
 *       [--volume 1] [--merchant-type cafe_bakery] [--commenced 2021-05-03]
 *       [--existing-debt-eur 450] [--no-assess]
 *       [--digital-share 0.7] [--digital-days N] [--evidence-environment test]
 *       [--mode mock|sandbox] [--float-usdc 45] [--full-profile]
 *       [--database-url postgres://…] [--allow-db-host db.example.com]
 *
 * Hosted demo merchant (devnet): see docs/demo-merchant-seeding.md.
 *
 * What it creates:
 *   - A 10-item café menu with ordinary SKUs and descriptions.
 *   - N days (default 32) of sales with a real café rhythm: morning rush,
 *     lunch peak, slow Mondays, busy Fridays/Saturdays, mostly closed Sundays,
 *     the odd quiet (rainy) day, occasional catering orders, sparse till notes.
 *   - Cash sales: backdated merchant-recorded cash sales through the public
 *     API, including a few voided double-rings.
 *   - Digital sales (--digital-share, default 0.7): each one is a real
 *     itemised invoice paid by a seed customer account through POST /payments,
 *     so wallets, ledger, stock reservations and receipts all go through the
 *     normal code path. --digital-days N limits digital sales to the last N
 *     days, as if the merchant started taking MCBuse payments then.
 *       --mode mock (default): local API with TRANSFER_PROVIDER=mock. The
 *         customer's wallet is topped up with a mock on-ramp credit written to
 *         the database.
 *       --mode sandbox: hosted devnet API. Every digital sale is a real devnet
 *         USDC transfer. The customer is funded once through a Stripe test
 *         checkout (the script prints the link), and whenever the float
 *         (--float-usdc) runs low the merchant sends what it has received back
 *         to the customer, so a few dozen test USDC carry the whole history. A payment is always stamped with the moment it
 *     settles, so once they are all paid the script moves each digital sale's
 *     timestamps back to its planned time with SQL (--database-url, or the
 *     DATABASE_* values in ./.env). It also moves each seeded product's
 *     opening stock to before the first sale so stock history reconstructs.
 *
 * Digital sales are recorded with evidence environment "test" by default,
 * which is what a devnet payment records. Pass --evidence-environment
 * synthetic to label them as demonstration data, or live to have the credit
 * model count them as live sales (credit inputs ignore anything but live).
 *
 * After seeding it fills any empty business credit-profile fields (category,
 * trading start date, existing debt), grants evidence-assessment consent if
 * needed, runs a saved assessment and prints the resulting scores. Inputs the
 * platform cannot measure yet come from the API's CREDIT_INPUT_DEFAULTS
 * (see credit-evidence.service.ts); without it the score stays empty.
 *
 * Nothing user-visible marks the records as seeded. Traceability lives only
 * in the Idempotency-Key prefix and the local manifest file. --undo voids the
 * seeded cash sales; digital payments are real settled payments and can only
 * be removed with a DB reset.
 *
 * GO-LIVE: history seeded into a hosted database must be removed before launch
 * (DB reset); see docs/go-live-checklist.md.
 *
 * Safety:
 *   - Local API and local database by default. A remote API is refused unless
 *     its exact hostname is passed with --allow-host, a remote database unless
 *     its hostname is passed with --allow-db-host.
 *   - Deterministic and idempotent: re-running on the same or a later day
 *     never duplicates sales; later runs only add the days since. A sale that
 *     an earlier run already recorded as cash stays cash, so for the full
 *     digital share run it against a freshly reset database.
 *   - Does not touch the merchant's wallets directly, assessments already
 *     saved, or Finance Match.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);
const API = arg('api', 'http://localhost:4000/api/v1').replace(/\/$/, '');
const DAYS = Math.min(Math.max(Number(arg('days', '32')), 1), 180);
const ALLOW_HOST = arg('allow-host', '')?.trim().toLowerCase();
const MANIFEST = arg('manifest', './seed-manifest.json');
const UNDO = flag('undo');
const VOLUME = Math.min(Math.max(Number(arg('volume', '1')), 0.2), 3);
const MERCHANT_TYPE = arg('merchant-type', 'cafe_bakery');
const COMMENCED = arg('commenced', '2021-05-03');
const EXISTING_DEBT_EUR = Number(arg('existing-debt-eur', '450'));
const ASSESS = !flag('no-assess');
const DIGITAL_SHARE = Math.min(Math.max(Number(arg('digital-share', '0.7')), 0), 1);
const EVIDENCE_ENVIRONMENT = arg('evidence-environment', 'test');
// mock: local API (TRANSFER_PROVIDER=mock). sandbox: hosted devnet API, where
// every digital sale is a real devnet USDC transfer.
const MODE = arg('mode', 'mock');
// Digital sales only in the most recent N days (older days are all cash), as if
// the merchant started taking MCBuse payments N days ago. Default: every day.
const DIGITAL_DAYS = Number(arg('digital-days', String(DAYS)));
// Test USDC the customer works with at once (sandbox), reused via paybacks.
const FLOAT_USDC = Number(arg('float-usdc', '45'));
// Also declare the optional business details (loan request, assets, debts…)
// so the assessment has complete information.
const FULL_PROFILE = flag('full-profile');
const ALLOW_DB_HOST = arg('allow-db-host', '')?.trim().toLowerCase();
const EMAIL = process.env.SEED_EMAIL?.trim().toLowerCase();
const PASSWORD = process.env.SEED_PASSWORD;
let TZ = 'Europe/Berlin'; // replaced by the merchant's own timezone after login
const KEY_PREFIX = 'ovw-seed:v2';
const PACE_MS = 700; // the API throttle is 100 req/min

const host = new URL(API).hostname.toLowerCase();
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host);
if (!isLocal && host !== ALLOW_HOST) {
  console.error(`Refusing to seed ${API}. For a non-local API pass --allow-host ${host}.`);
  process.exit(1);
}
if (!EMAIL || !PASSWORD) {
  console.error('Set SEED_EMAIL and SEED_PASSWORD for the merchant account.');
  process.exit(1);
}
if (!['mock', 'sandbox'].includes(MODE)) {
  console.error('--mode must be mock or sandbox.');
  process.exit(1);
}
if (!['test', 'synthetic', 'live'].includes(EVIDENCE_ENVIRONMENT)) {
  console.error('--evidence-environment must be test, synthetic or live.');
  process.exit(1);
}
// The customer who pays the digital sales. Derived from the merchant login so
// a re-run finds the same account without anything stored.
const PAYER_TAG = createHash('sha256').update(`${EMAIL}:${KEY_PREFIX}`).digest('hex').slice(0, 10);
const PAYER_EMAIL = process.env.SEED_PAYER_EMAIL?.trim().toLowerCase() ?? `seed-payer-${PAYER_TAG}@example.com`;
const PAYER_USERNAME = `seed_payer_${PAYER_TAG}`;
const PAYER_PASSWORD =
  process.env.SEED_PAYER_PASSWORD ??
  `Sp!${createHash('sha256').update(`${PASSWORD}:${PAYER_EMAIL}`).digest('hex').slice(0, 16)}Aa9`;

/* ------------------------------------------------------------ catalogue */
// price in EUR cents; weight = relative popularity; endStock = stock left after seeding
const CATALOGUE = [
  { sku: 'COF-ESP', name: 'Espresso', category: 'Coffee', price: 220, weight: 14, endStock: 60, description: 'Single origin, double shot' },
  { sku: 'COF-CAP', name: 'Cappuccino', category: 'Coffee', price: 340, weight: 18, endStock: 55, description: 'Regular, whole or oat milk' },
  { sku: 'COF-FLW', name: 'Flat white', category: 'Coffee', price: 360, weight: 12, endStock: 40, description: 'Double ristretto, steamed milk' },
  { sku: 'TEA-BLK', name: 'Black tea', category: 'Tea', price: 250, weight: 6, endStock: 30, description: 'Assam, served with milk on the side' },
  { sku: 'BAK-CRO', name: 'Butter croissant', category: 'Bakery', price: 280, weight: 13, endStock: 3, description: 'Baked fresh every morning' },
  { sku: 'BAK-PAC', name: 'Pain au chocolat', category: 'Bakery', price: 310, weight: 9, endStock: 22, description: '' },
  { sku: 'BAK-SOU', name: 'Sourdough loaf', category: 'Bakery', price: 650, weight: 4, endStock: 2, description: '800 g, 36-hour ferment' },
  { sku: 'BAK-BAN', name: 'Banana bread slice', category: 'Bakery', price: 350, weight: 5, endStock: 18, description: '' },
  { sku: 'LUN-HCS', name: 'Ham and cheese sandwich', category: 'Lunch', price: 690, weight: 8, endStock: 4, description: 'On sourdough, made to order' },
  { sku: 'DRK-OJ', name: 'Fresh orange juice', category: 'Drinks', price: 420, weight: 5, endStock: 25, description: 'Pressed daily, 300 ml' },
];
const LOW_STOCK_THRESHOLD = 5;
// Short till notes a cashier might add; most sales have none.
const NOTES = ['Takeaway', 'Takeaway', 'Table 2', 'Table 4', 'Table 5', 'Oat milk', 'Paid exact', 'Regular', 'Extra shot'];
const CATERING = ['Office breakfast tray', 'Pastry platter (pre-order)', 'Coffee pots for meeting', 'Sandwich platter'];
const VOID_REASONS = ['Rung up twice', 'Wrong item entered', 'Duplicate entry'];

/* ------------------------------------------------- deterministic random */
function rng(seedText) {
  let h = 2166136261;
  for (const c of seedText) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickWeighted = (r, items, w) => {
  let x = r() * items.reduce((s, i) => s + w(i), 0);
  for (const i of items) if ((x -= w(i)) <= 0) return i;
  return items[items.length - 1];
};

/* ------------------------------------------------------- timezone help */
function tzOffsetMs(date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date).map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime();
}
function localToUtc(ymd, minutesOfDay) {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutesOfDay);
  return new Date(guess - tzOffsetMs(new Date(guess)));
}
function localYmd(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
}

/* ------------------------------------------------------ sale generation */
// Café rhythm: morning rush, lunch peak, quiet afternoon (local minutes from midnight).
const WINDOWS = [
  { from: 7 * 60, to: 10 * 60 + 30, weight: 5 },
  { from: 11 * 60 + 30, to: 14 * 60, weight: 4 },
  { from: 14 * 60, to: 17 * 60 + 30, weight: 2 },
];
function planSales(now) {
  const sales = [];
  const today = localYmd(now);
  for (let back = DAYS - 1; back >= 0; back--) {
    const ymd = localYmd(new Date(now.getTime() - back * 86_400_000));
    const r = rng(`${KEY_PREFIX}:${ymd}`);
    const weekday = new Date(`${ymd}T12:00:00Z`).getUTCDay();
    if (weekday === 0 && r() < 0.6) continue; // mostly closed Sundays
    const growth = 1 + ((DAYS - back) / DAYS) * 0.3; // gentle upward trend
    const base = (weekday === 6 ? 24 : weekday === 5 ? 22 : weekday === 1 ? 13 : weekday === 0 ? 11 : 17) * VOLUME;
    const weather = r() < 0.12 ? 0.6 : 1; // the odd quiet, rainy day
    const count = Math.max(1, Math.round((base + r() * 5 * VOLUME) * growth * weather));
    for (let n = 0; n < count; n++) {
      const w = pickWeighted(r, WINDOWS, (x) => x.weight);
      const minutes = Math.floor(w.from + r() * (w.to - w.from));
      const occurredAt = localToUtc(ymd, minutes);
      const lines = [];
      const lineCount = r() < 0.5 ? 1 : r() < 0.85 ? 2 : 3;
      const used = new Set();
      for (let l = 0; l < lineCount; l++) {
        const p = pickWeighted(r, CATALOGUE, (x) => x.weight);
        if (used.has(p.sku)) continue;
        used.add(p.sku);
        lines.push({ sku: p.sku, quantity: r() < 0.93 ? 1 : 2 });
      }
      let note = r() < 0.18 ? NOTES[Math.floor(r() * NOTES.length)] : '';
      if (weekday >= 1 && weekday <= 5 && r() < 0.007) {
        lines.push({ custom: true, name: CATERING[Math.floor(r() * CATERING.length)], unitPriceMinor: String(1400 + Math.floor(r() * 9) * 100), quantity: 1 });
        note = r() < 0.5 ? 'Collected' : note;
      }
      const voidReason = r() < 0.006 ? VOID_REASONS[Math.floor(r() * VOID_REASONS.length)] : null;
      const key = `${KEY_PREFIX}:${ymd}:${n}`;
      // The channel draws from its own stream, so every other detail of a sale
      // (and so each cash sale's idempotency fingerprint) is unchanged by it.
      const digital = !voidReason && back < DIGITAL_DAYS && rng(`${key}:channel`)() < DIGITAL_SHARE;
      sales.push({ key, occurredAt, lines, note, voidReason, channel: digital ? 'digital' : 'cash', isToday: ymd === today });
    }
  }
  // Only the past can be recorded.
  return sales.filter((s) => s.occurredAt < now).sort((a, b) => a.occurredAt - b.occurredAt);
}

/* ----------------------------------------------------------------- HTTP */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let token = '';
let payerToken = '';
async function call(method, path, body, headers = {}, attempt = 0, as = null) {
  await sleep(PACE_MS);
  const bearer = as ?? token;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && attempt < 5) {
    process.stdout.write(' (rate limited, waiting 60s)');
    await sleep(60_000);
    return call(method, path, body, headers, attempt + 1, as);
  }
  // Access tokens last 15 minutes and a seed run takes much longer: sign the
  // same identity in again and retry once.
  if (res.status === 401 && bearer && !path.startsWith('/auth/') && attempt < 5) {
    const isPayer = bearer === payerToken;
    const fresh = await call('POST', '/auth/login', isPayer ? { email: PAYER_EMAIL, password: PAYER_PASSWORD } : { email: EMAIL, password: PASSWORD }, {}, 0, '');
    if (isPayer) payerToken = fresh.accessToken;
    else token = fresh.accessToken;
    return call(method, path, body, headers, attempt + 1, isPayer ? payerToken : as === null ? null : token);
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function listAllProducts() {
  const all = [];
  for (let page = 1; ; page++) {
    const res = await call('GET', `/merchants/me/products?page=${page}&pageSize=100`);
    const items = res.items ?? res.products ?? [];
    all.push(...items);
    if (!items.length || page >= (res.totalPages ?? 1)) break;
  }
  return all;
}

/* ------------------------------------------------------------- database */
// Only the digital history needs the database: to move settled payments back
// to their planned times. Everything else goes through the public API.
function databaseUrl() {
  const explicit = arg('database-url', process.env.DATABASE_URL);
  if (explicit) return explicit;
  let env = {};
  try {
    env = Object.fromEntries(
      fs.readFileSync('.env', 'utf8').split('\n')
        .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
        .filter(Boolean)
        .map(([, k, v]) => [k, v.replace(/^(['"])(.*)\1$/, '$2')]),
    );
  } catch {
    return null;
  }
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (!env.DATABASE_HOST) return null;
  const user = encodeURIComponent(env.DATABASE_USER ?? 'postgres');
  const pass = encodeURIComponent(env.DATABASE_PASSWORD ?? '');
  return `postgres://${user}:${pass}@${env.DATABASE_HOST}:${env.DATABASE_PORT ?? 5432}/${env.DATABASE_NAME ?? 'postgres'}`;
}

/** Connects and resolves the merchant's internal id from its public id. */
async function connectDatabase(merchantPublicId) {
  const url = databaseUrl();
  if (!url) throw new Error('Digital sales need the database to backdate them. Pass --database-url or run from apps/api with DATABASE_* in .env (or use --digital-share 0).');
  const dbHost = new URL(url).hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(dbHost) && dbHost !== ALLOW_DB_HOST)
    throw new Error(`Refusing to write to database host ${dbHost}. For a non-local database pass --allow-db-host ${dbHost}.`);
  const { default: pg } = await import('pg');
  // Same switch the API uses: DATABASE_SSL=true verifies, no-verify encrypts
  // without checking the certificate (hosted Supabase), anything else is off.
  const sslMode = (process.env.DATABASE_SSL ?? '').toLowerCase();
  const ssl = sslMode === 'true' ? true : sslMode === 'no-verify' ? { rejectUnauthorized: false } : undefined;
  const db = new pg.Client({ connectionString: url, ...(ssl ? { ssl } : {}) });
  await db.connect();
  // The API and the database must be the same system, or nothing lines up.
  const found = await db.query('select id from merchants where public_id = $1', [merchantPublicId]);
  if (!found.rowCount) {
    await db.end();
    throw new Error('The merchant from the API was not found in that database. Is --database-url the database this API uses?');
  }
  return { db, merchantId: found.rows[0].id };
}

/* ------------------------------------------------------- digital sales */
/** A stable UUID v4 from text, so a retried payment reuses its idempotency key. */
function uuidFrom(text) {
  const h = createHash('sha256').update(text).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Signs the seed customer in (creating the account the first time). */
async function payerLogin() {
  try {
    const login = await call('POST', '/auth/login', { email: PAYER_EMAIL, password: PAYER_PASSWORD }, {}, 0, '');
    return login.accessToken;
  } catch (e) {
    if (e.status !== 401 && e.status !== 404) throw e;
  }
  const signup = await call('POST', '/auth/signup', {
    email: PAYER_EMAIL,
    password: PAYER_PASSWORD,
    firstName: 'Regular',
    lastName: 'Customer',
    username: PAYER_USERNAME,
  }, {}, 0, '');
  console.log(`  created seed customer ${PAYER_EMAIL}`);
  return signup.accessToken;
}

/**
 * Tops the customer's routine wallet (the one QR payments spend) up for the
 * payments still to make. Local mock mode has no API route into that wallet
 * (savings → routine needs sandbox mode), so this writes the same balance
 * credit and "on_ramp" ledger entry the mock on-ramp writes, straight into
 * the routine wallet.
 */
async function fundPayer(db, euroCents) {
  if (euroCents <= 0) return;
  // EUR cents → USDC base units (6 dp) with a generous margin for the FX quote.
  const usdc = BigInt(Math.ceil(euroCents * 1.3)) * 10_000n;
  await db.query('begin');
  try {
    const wallet = await db.query(
      `select w.id from wallets w join users u on u.id = w.user_id
        where u.email = $1 and w.type = 'routine' limit 1`, [PAYER_EMAIL]);
    const walletId = wallet.rows[0]?.id;
    if (!walletId) throw new Error(`No routine wallet found for ${PAYER_EMAIL}.`);
    const credited = await db.query(
      `update balances set available = available + $2::bigint where wallet_id = $1 and currency = 'USDC' returning id`,
      [walletId, usdc.toString()]);
    if (credited.rowCount !== 1) throw new Error('The seed customer has no USDC balance row.');
    await db.query(
      `insert into ledger_entries (debit_wallet_id, credit_wallet_id, amount, currency, type, status, idempotency_key, metadata)
       values ($1, $1, $2::bigint, 'USDC', 'on_ramp', 'completed', $3, $4)`,
      [walletId, usdc.toString(), uuidFrom(`${KEY_PREFIX}:fund:${PAYER_EMAIL}:${Date.now()}`), JSON.stringify({ provider: 'mock', purpose: 'seed-local-overview-demo' })]);
    await db.query('commit');
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
  console.log(`  topped up the seed customer with ${(Number(usdc) / 1e6).toFixed(2)} USDC`);
}

/* --------------------------------------------------- customer's wallet */
// The customer pays from their routine wallet. A float covers the next few
// payments; when it runs low the merchant sends what it has received back to
// the customer, so a small amount of test USDC can carry a month of sales.
const BASE_UNITS_PER_EURO_CENT = 11_500n; // EUR → USDC base units, with FX headroom
let payerAvailable = 0n;

async function routineAvailable(as) {
  const summary = await call('GET', '/accounts', undefined, {}, 0, as);
  const card = summary?.accounts?.find((a) => a.account === 'routine');
  return BigInt(card?.settlement?.availableBaseUnits ?? '0');
}
async function holdingAvailable(as) {
  const summary = await call('GET', '/accounts', undefined, {}, 0, as);
  const card = summary?.accounts?.find((a) => a.account === 'holding');
  return BigInt(card?.settlement?.availableBaseUnits ?? '0');
}

async function waitFor(check, label, timeoutMs = 15 * 60_000, everyMs = 5_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return;
    await sleep(everyMs);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

/**
 * Sandbox: funds the customer's holding account with a Stripe test checkout
 * (a person completes it in the browser), then moves it to routine.
 */
async function fundPayerSandbox(floatBaseUnits) {
  payerAvailable = await routineAvailable(payerToken);
  if (payerAvailable >= floatBaseUnits / 2n) return;
  if ((await holdingAvailable(payerToken)) < floatBaseUnits) {
    const amountCents = String((floatBaseUnits + 9_999n) / 10_000n); // USDC base units → USD cents
    const started = await call('POST', '/accounts/funding', { method: 'card', amountCents },
      { 'idempotency-key': uuidFrom(`${KEY_PREFIX}:funding:${PAYER_EMAIL}:${amountCents}:${new Date().toISOString().slice(0, 13)}`) }, 0, payerToken);
    if (!started?.checkoutUrl) throw new Error(`Funding did not return a checkout link: ${JSON.stringify(started).slice(0, 300)}`);
    console.log('\n  ACTION NEEDED: open this Stripe test checkout and pay it with a Stripe test card:');
    console.log(`  ${started.checkoutUrl}`);
    console.log('  Waiting for the test USDC to arrive (up to 15 minutes)…');
    await waitFor(async () => (await holdingAvailable(payerToken)) >= floatBaseUnits - 10_000n, 'the customer funding');
  }
  const holding = await holdingAvailable(payerToken);
  const cents = String(holding / 10_000n);
  await call('POST', '/accounts/transfers', { from: 'holding', to: 'routine', amountCents: cents },
    { 'idempotency-key': uuidFrom(`${KEY_PREFIX}:h2r:${PAYER_EMAIL}:${Date.now()}`) }, 0, payerToken);
  await waitFor(async () => (payerAvailable = await routineAvailable(payerToken)) >= floatBaseUnits / 2n, 'the holding → routine transfer', 5 * 60_000);
  console.log(`  customer float: ${(Number(payerAvailable) / 1e6).toFixed(2)} USDC`);
}

let paybacks = 0;
/** Sends the merchant's received USDC back to the customer. */
async function payBack(needed) {
  const merchantHas = await routineAvailable(token);
  if (merchantHas <= 0n) throw new Error('The customer has run out of USDC and the merchant has nothing to send back. Fund the customer again and re-run.');
  const before = await routineAvailable(payerToken);
  await call('POST', '/payments/username', { username: PAYER_USERNAME, amount: merchantHas.toString(), currency: 'USDC' },
    {}, 0, token);
  paybacks++;
  await waitFor(async () => (payerAvailable = await routineAvailable(payerToken)) > before, 'the payback to arrive', 5 * 60_000, 2_000);
  if (payerAvailable < needed) throw new Error('After a payback the customer still cannot afford the next sale; raise --float-usdc.');
}

async function ensurePayerCanPay(euroCents) {
  const needed = BigInt(euroCents) * BASE_UNITS_PER_EURO_CENT;
  if (payerAvailable >= needed) return;
  payerAvailable = await routineAvailable(payerToken);
  if (payerAvailable >= needed) return;
  await payBack(needed);
}
function notePayment(euroCents) {
  payerAvailable -= BigInt(euroCents) * BASE_UNITS_PER_EURO_CENT;
}

/** Creates the itemised invoice for one sale and pays it as the customer. */
async function recordDigitalSale(sale, lines, manifest, productIds) {
  const existing = manifest.digital[sale.key];
  if (existing?.status === 'completed') return existing;
  let invoice = existing?.requestId ? await call('GET', `/merchants/me/invoices/${existing.requestId}`) : null;
  if (!invoice || ['expired', 'cancelled', 'failed'].includes(invoice.status)) {
    const body = { lines, ...(sale.note ? { description: sale.note } : {}), expiresInSeconds: 3600 };
    try {
      invoice = await call('POST', '/merchants/me/invoices', body);
    } catch (e) {
      if (!(e.status === 409 && /stock/i.test(e.message))) throw e;
      for (const l of sale.lines) if (l.sku)
        await call('POST', `/merchants/me/products/${productIds[l.sku]}/stock-adjustments`, { reason: 'restock', change: 50 });
      invoice = await call('POST', '/merchants/me/invoices', body);
    }
    manifest.digital[sale.key] = { requestId: invoice.id, occurredAt: sale.occurredAt.toISOString(), status: invoice.status, backdated: false };
    writeManifest(manifest);
  }
  if (invoice.status !== 'completed') {
    const nonce = new URL(invoice.qrPayload).searchParams.get('nonce');
    const paid = await call('POST', '/payments', { nonce, idempotencyKey: uuidFrom(`${sale.key}:pay`) }, {}, 0, payerToken);
    // A settled payment says so; otherwise wait for the invoice to settle.
    // (The backdate step re-checks every one is completed in the database.)
    if (paid?.status === 'completed') invoice = { ...invoice, status: 'completed' };
    // Devnet settlement can take a while; mock settles at once.
    const until = Date.now() + (MODE === 'sandbox' ? 120_000 : 15_000);
    while (invoice.status !== 'completed' && invoice.status !== 'failed' && Date.now() < until) {
      invoice = await call('GET', `/merchants/me/invoices/${invoice.id}`);
      if (invoice.status !== 'completed' && MODE === 'sandbox') await sleep(1_500);
    }
  }
  if (invoice.status !== 'completed')
    throw new Error(`Digital sale ${sale.key} ended as "${invoice.status}". ${MODE === 'mock' ? ' Is the API running with TRANSFER_PROVIDER=mock?' : ''}`);
  manifest.digital[sale.key] = { ...manifest.digital[sale.key], status: 'completed' };
  return manifest.digital[sale.key];
}

/**
 * Moves settled digital sales from the moment they were paid to their planned
 * sale time, across every table that dates them, in one transaction. Also
 * sets their evidence environment and moves seeded products' opening stock to
 * before the first sale.
 */
async function backdate(db, merchantId, manifest, firstSaleAt) {
  const pending = Object.values(manifest.digital).filter((d) => d.status === 'completed' && !d.backdated);
  const productIds = Object.values(manifest.products ?? {});
  await db.query('begin');
  try {
    if (pending.length) {
      await db.query('create temp table seed_backdate (id uuid primary key, at timestamptz not null) on commit drop');
      await db.query('insert into seed_backdate select * from unnest($1::uuid[], $2::timestamptz[])', [
        pending.map((d) => d.requestId),
        pending.map((d) => d.occurredAt),
      ]);
      const owned = await db.query(
        `select count(*)::int as n from payment_requests pr join seed_backdate t on t.id = pr.id
          where pr.merchant_id = $1 and pr.status = 'completed'`, [merchantId]);
      if (owned.rows[0].n !== pending.length) throw new Error('Some manifest payments are not completed payments of this merchant; nothing was changed.');
      const q = (sql, params = []) => db.query(sql, params);
      // Reservations carry no reference; they were written in the same
      // transaction as the invoice, so they share its original created_at.
      await q(`update merchant_stock_movements m set occurred_at = t.at - interval '45 seconds'
                 from seed_backdate t join payment_requests pr on pr.id = t.id
                where m.merchant_id = pr.merchant_id and m.kind = 'invoice_reservation'
                  and m.reference_id is null and m.occurred_at = pr.created_at`);
      await q(`update merchant_stock_movements m set occurred_at = t.at
                 from seed_backdate t where m.reference_id = t.id and m.kind = 'digital_sale'`);
      await q(`update merchant_invoice_items i set created_at = t.at - interval '45 seconds'
                 from seed_backdate t where i.payment_request_id = t.id`);
      await q(`update merchant_payment_attempts a
                  set claimed_at = t.at - interval '6 seconds', submitted_at = t.at - interval '4 seconds',
                      finalized_at = t.at, updated_at = t.at
                 from seed_backdate t where a.payment_request_id = t.id`);
      await q(`update merchant_capture_exceptions c
                  set created_at = t.at - interval '5 seconds',
                      resolved_at = case when c.resolved_at is null then null else t.at end
                 from seed_backdate t where c.payment_request_id = t.id`);
      await q(`update ledger_entries l set created_at = t.at from seed_backdate t where l.payment_request_id = t.id`);
      await q(`update merchant_events e set created_at = t.at from seed_backdate t where e.payment_request_id = t.id`);
      await q(`update payment_requests pr
                  set created_at = t.at - interval '45 seconds', quoted_at = t.at - interval '45 seconds',
                      processing_at = t.at - interval '6 seconds', completed_at = t.at,
                      expires_at = t.at + interval '1 hour' - interval '45 seconds'
                 from seed_backdate t where pr.id = t.id`);
      await q(`update merchant_transactions x
                  set occurred_at = t.at, finalized_at = t.at, created_at = t.at, evidence_environment = $1
                 from seed_backdate t where x.payment_request_id = t.id`, [EVIDENCE_ENVIRONMENT]);
    }
    if (productIds.length && firstSaleAt) {
      await db.query(
        `update merchant_stock_movements set occurred_at = $3
          where merchant_id = $1 and kind = 'opening_balance' and reference_type = 'product'
            and reference_id = any($2::uuid[]) and occurred_at > $3`,
        [merchantId, productIds, new Date(firstSaleAt.getTime() - 86_400_000)],
      );
    }
    await db.query('commit');
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
  for (const d of pending) d.backdated = true;
  writeManifest(manifest);
  return pending.length;
}

/* ----------------------------------------------------------------- main */
function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch {
    return { api: API, email: EMAIL, products: {}, sales: {}, digital: {} };
  }
}
function writeManifest(m) {
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

async function undo() {
  const m = readManifest();
  const ids = Object.values(m.sales ?? {});
  console.log(`Voiding ${ids.length} seeded cash sales listed in ${MANIFEST}`);
  let n = 0;
  for (const id of ids) {
    await call('POST', `/merchants/me/cash-sales/${id}/void`, { reason: 'Entered in error' });
    if (++n % 25 === 0 || n === ids.length) process.stdout.write(`\r  voided ${n}/${ids.length}`);
  }
  console.log('\nDone. Products were left in place; archive them from the portal if needed.');
  const digital = Object.keys(m.digital ?? {}).length;
  if (digital) console.log(`  ${digital} digital sales are settled payments and stay; reset the database to remove them.`);
}

async function assess() {
  // Fill only what the merchant has not declared yet; never overwrite.
  const current = (await call('GET', '/merchants/me/credit-profile')) ?? {};
  const wanted = {
    merchantType: MERCHANT_TYPE,
    commencementDate: COMMENCED,
    existingDebtMinor: String(Math.round(EXISTING_DEBT_EUR * 100)),
    // A modest working-capital request from a café with more assets than debts.
    ...(FULL_PROFILE
      ? {
          loanAmountMinor: '300000',
          loanTermMonths: 12,
          inventoryValueMinor: '120000',
          collateralValueMinor: '800000',
          businessAssetsMinor: '2500000',
          businessDebtsMinor: '200000',
          ownerPersonalAssetsMinor: '4000000',
          ownerPersonalDebtsMinor: '500000',
        }
      : {}),
  };
  const patch = Object.fromEntries(Object.entries(wanted).filter(([k]) => current[k] === undefined || current[k] === null));
  if (Object.keys(patch).length) await call('PATCH', '/merchants/me/credit-profile', { data: patch });

  const consent = await call('GET', '/merchants/me/consents');
  if (!(consent?.active ?? consent?.evidenceAssessment?.active)) await call('POST', '/merchants/me/consents', { active: true });

  const run = await call('POST', '/merchants/me/assessments', {}, { 'idempotency-key': `assess-${Date.now()}` });
  const c = run?.result?.credit ?? run?.credit;
  console.log('\n  assessment:', c?.status ?? 'unknown');
  if (c?.financialProfile) console.log(`  financial profile: ${Math.round(c.financialProfile.score)}/100`);
  if (c?.creditScore) console.log(`  credit score: ${c.creditScore.score} (${c.creditScore.grade})`);
  if (c?.profileConfidence) console.log(`  confidence: ${c.profileConfidence.label}`);
  if (c?.unavailableFields?.length) console.log(`  still unavailable: ${c.unavailableFields.join(', ')}`);
}

async function main() {
  const login = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  token = login.accessToken;
  if (!token) throw new Error('Login did not return an access token');
  const me = await call('GET', '/merchants/me'); // fails early if the account has no merchant
  const merchantPublicId = me?.id;
  if (me?.timezone) TZ = me.timezone;
  if (UNDO) return undo();

  console.log(`Seeding ${API} for ${EMAIL} (${DAYS} days, ${TZ})`);
  const manifest = readManifest();
  manifest.sales ??= {};
  manifest.products ??= {};
  manifest.digital ??= {};
  const now = new Date();
  const sales = planSales(now);

  // Opening stock = planned usage + intended stock left (a few end below threshold).
  const usage = Object.fromEntries(CATALOGUE.map((p) => [p.sku, 0]));
  for (const s of sales) for (const l of s.lines) if (l.sku) usage[l.sku] += l.quantity;

  const skus = new Set(CATALOGUE.map((p) => p.sku));
  const existing = new Map((await listAllProducts()).filter((p) => skus.has(p.sku)).map((p) => [p.sku, p]));
  const productIds = {};
  for (const p of CATALOGUE) {
    if (existing.has(p.sku)) {
      productIds[p.sku] = existing.get(p.sku).id;
      continue;
    }
    const created = await call('POST', '/merchants/me/products', {
      name: p.name,
      category: p.category,
      sku: p.sku,
      ...(p.description ? { description: p.description } : {}),
      unitPriceMinor: String(p.price),
      quantity: usage[p.sku] + p.endStock,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
    });
    productIds[p.sku] = created.id;
    manifest.products[p.sku] = created.id;
    console.log(`  product ${p.sku} ${p.name} (stock ${usage[p.sku] + p.endStock})`);
  }
  writeManifest(manifest);

  // A sale an earlier run already recorded as cash stays cash.
  let keptAsCash = 0;
  for (const sale of sales)
    if (sale.channel === 'digital' && manifest.sales[sale.key]) {
      sale.channel = 'cash';
      keptAsCash++;
    }
  const priceOf = Object.fromEntries(CATALOGUE.map((p) => [p.sku, p.price]));
  const saleCents = (sale) => sale.lines.reduce((sum, l) => sum + (l.custom ? Number(l.unitPriceMinor) : priceOf[l.sku]) * l.quantity, 0);
  const digitalToPay = sales.filter((s) => s.channel === 'digital' && manifest.digital[s.key]?.status !== 'completed');
  let db = null;
  let merchantId = null;
  if (sales.some((s) => s.channel === 'digital')) {
    ({ db, merchantId } = await connectDatabase(merchantPublicId));
    if (digitalToPay.length) {
      payerToken = await payerLogin();
      const floatBaseUnits = BigInt(Math.round(FLOAT_USDC * 1e6));
      const largest = Math.max(...digitalToPay.map(saleCents));
      if (BigInt(largest) * BASE_UNITS_PER_EURO_CENT > floatBaseUnits)
        throw new Error(`The largest digital sale (€${(largest / 100).toFixed(2)}) is more than the --float-usdc of ${FLOAT_USDC}; raise it.`);
      if (MODE === 'sandbox') await fundPayerSandbox(floatBaseUnits);
      else if (arg('float-usdc', null) !== null) {
        // A deliberately small float exercises the payback loop locally.
        await fundPayer(db, Number(floatBaseUnits / BASE_UNITS_PER_EURO_CENT));
        payerAvailable = await routineAvailable(payerToken);
      } else {
        await fundPayer(db, digitalToPay.reduce((sum, s) => sum + saleCents(s), 0));
        payerAvailable = await routineAvailable(payerToken);
      }
    }
  }

  let done = 0;
  let voided = 0;
  let totalMinor = 0;
  let digitalCount = 0;
  let digitalMinor = 0;
  for (const sale of sales) {
    const lines = sale.lines.map((l) =>
      l.custom
        ? { type: 'custom', name: l.name, unitPriceMinor: l.unitPriceMinor, quantity: l.quantity }
        : { type: 'product', productId: productIds[l.sku], quantity: l.quantity },
    );
    if (sale.channel === 'digital') {
      if (manifest.digital[sale.key]?.status !== 'completed') await ensurePayerCanPay(saleCents(sale));
      const before = manifest.digital[sale.key]?.status;
      await recordDigitalSale(sale, lines, manifest, productIds);
      if (before !== 'completed') notePayment(saleCents(sale));
      digitalCount++;
      digitalMinor += saleCents(sale);
      totalMinor += saleCents(sale);
      done++;
      if (done % 25 === 0 || done === sales.length) {
        writeManifest(manifest);
        process.stdout.write(`\r  sales ${done}/${sales.length} (${digitalCount} digital)`);
      }
      continue;
    }
    // Already recorded by an earlier run: skip the round trip (a re-sent sale
    // would only return the same record).
    if (manifest.sales[sale.key] && !sale.voidReason) {
      totalMinor += saleCents(sale);
      done++;
      continue;
    }
    const body = { lines, ...(sale.note ? { description: sale.note } : {}), occurredAt: sale.occurredAt.toISOString() };
    let res;
    try {
      res = await call('POST', '/merchants/me/cash-sales', body, { 'idempotency-key': sale.key });
    } catch (e) {
      if (e.status === 409 && /stock/i.test(e.message)) {
        // A later re-run can outgrow the opening stock: restock, then retry once.
        for (const l of sale.lines) if (l.sku)
          await call('POST', `/merchants/me/products/${productIds[l.sku]}/stock-adjustments`, { reason: 'restock', change: 50 });
        res = await call('POST', '/merchants/me/cash-sales', body, { 'idempotency-key': sale.key });
      } else throw e;
    }
    const id = res?.id;
    if (id) manifest.sales[sale.key] = id;
    if (sale.voidReason && id) {
      await call('POST', `/merchants/me/cash-sales/${id}/void`, { reason: sale.voidReason });
      voided++;
    } else totalMinor += Number(res?.amountMinor ?? res?.amount?.minor ?? 0);
    done++;
    if (done % 25 === 0 || done === sales.length) {
      writeManifest(manifest);
      process.stdout.write(`\r  sales ${done}/${sales.length} (${digitalCount} digital)`);
    }
  }
  writeManifest(manifest);
  if (db) {
    try {
      const moved = await backdate(db, merchantId, manifest, sales[0]?.occurredAt);
      console.log(`\n  moved ${moved} digital sales to their sale times (evidence environment: ${EVIDENCE_ENVIRONMENT})`);
    } finally {
      await db.end();
    }
  }
  if (ASSESS) await assess();
  const cashCount = sales.length - digitalCount;
  console.log(`\nDone. ${sales.length} sales across ${DAYS} days: ${digitalCount} digital, ${cashCount} cash (${sales.filter((s) => s.isToday).length} today, ${voided} voided).`);
  if (totalMinor) {
    console.log(`  sales total ≈ €${(totalMinor / 100).toFixed(2)} (re-sent sales are not double-counted)`);
    console.log(`  digital share ≈ ${Math.round((digitalMinor / totalMinor) * 100)}% of value, ${Math.round((digitalCount / Math.max(1, sales.length - voided)) * 100)}% of sales`);
  }
  if (paybacks) console.log(`  ${paybacks} paybacks from the merchant to the seed customer kept the float moving.`);
  if (keptAsCash)
    console.log(`  ${keptAsCash} planned digital sales stayed cash because an earlier run recorded them as cash. Reset the database and re-run for the full share.`);
  console.log(`  manifest: ${MANIFEST}  (run again with --undo to void these sales)`);
}

main().catch((e) => {
  console.error(`\nSeeding stopped: ${e.message}`);
  process.exit(1);
});
