#!/usr/bin/env node
/**
 * Seeds a merchant account with a realistic café trading history so the
 * Overview, readiness and credit-evidence views have data to work with.
 *
 *   SEED_EMAIL=you@example.com SEED_PASSWORD='…' \
 *     node scripts/seed-local-overview-demo.mjs \
 *       [--api http://localhost:4000/api/v1] [--days 32] \
 *       [--allow-host api.mcbuse.com] [--manifest ./seed-manifest.json] [--undo]
 *       [--volume 1] [--merchant-type cafe_bakery] [--commenced 2021-05-03]
 *       [--existing-debt-eur 450] [--no-assess]
 *
 * What it creates (all through the public merchant API, never raw SQL):
 *   - A 10-item café menu with ordinary SKUs and descriptions.
 *   - Backdated merchant-recorded cash sales over the last N days (default 32)
 *     with a real café rhythm: morning rush, lunch peak, slow Mondays, busy
 *     Fridays/Saturdays, mostly closed Sundays, the odd quiet (rainy) day,
 *     occasional catering orders, sparse till notes and a few voided
 *     double-rings.
 *
 * After seeding it fills any empty business credit-profile fields (category,
 * trading start date, existing debt), grants evidence-assessment consent if
 * needed, runs a saved assessment and prints the resulting scores. Inputs the
 * platform cannot measure yet come from the API's CREDIT_INPUT_DEFAULTS
 * (see credit-evidence.service.ts); without it the score stays empty.
 *
 * Nothing user-visible marks the records as seeded. Traceability lives only
 * in the Idempotency-Key prefix and the local manifest file, so the history
 * can be voided later with --undo (or removed wholesale by a DB reset).
 *
 * GO-LIVE: history seeded into a hosted database must be removed before launch
 * (DB reset or --undo); see docs/go-live-checklist.md.
 *
 * Safety:
 *   - Local API by default. A remote API is refused unless its exact hostname
 *     is passed with --allow-host.
 *   - Deterministic and idempotent: re-running on the same or a later day
 *     never duplicates sales; later runs only add the days since.
 *   - Does not touch wallets, balances, digital payments, assessments,
 *     consent or Finance Match. Those stay as they really are.
 */
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
const EMAIL = process.env.SEED_EMAIL?.trim().toLowerCase();
const PASSWORD = process.env.SEED_PASSWORD;
let TZ = 'Europe/Berlin'; // replaced by the merchant's own timezone after login
const KEY_PREFIX = 'ovw-seed:v2';
const PACE_MS = 700; // local throttle is 100 req/min

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
      sales.push({ key: `${KEY_PREFIX}:${ymd}:${n}`, occurredAt, lines, note, voidReason, isToday: ymd === today });
    }
  }
  // Only the past can be recorded.
  return sales.filter((s) => s.occurredAt < now).sort((a, b) => a.occurredAt - b.occurredAt);
}

/* ----------------------------------------------------------------- HTTP */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let token = '';
async function call(method, path, body, headers = {}, attempt = 0) {
  await sleep(PACE_MS);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && attempt < 5) {
    process.stdout.write(' (rate limited, waiting 60s)');
    await sleep(60_000);
    return call(method, path, body, headers, attempt + 1);
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

/* ----------------------------------------------------------------- main */
function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch {
    return { api: API, email: EMAIL, products: {}, sales: {} };
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
}

async function assess() {
  // Fill only what the merchant has not declared yet; never overwrite.
  const current = (await call('GET', '/merchants/me/credit-profile')) ?? {};
  const wanted = {
    merchantType: MERCHANT_TYPE,
    commencementDate: COMMENCED,
    existingDebtMinor: String(Math.round(EXISTING_DEBT_EUR * 100)),
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
  if (me?.timezone) TZ = me.timezone;
  if (UNDO) return undo();

  console.log(`Seeding ${API} for ${EMAIL} (${DAYS} days, ${TZ})`);
  const manifest = readManifest();
  manifest.sales ??= {};
  manifest.products ??= {};
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

  let done = 0;
  let voided = 0;
  let totalMinor = 0;
  for (const sale of sales) {
    const lines = sale.lines.map((l) =>
      l.custom
        ? { type: 'custom', name: l.name, unitPriceMinor: l.unitPriceMinor, quantity: l.quantity }
        : { type: 'product', productId: productIds[l.sku], quantity: l.quantity },
    );
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
      process.stdout.write(`\r  cash sales ${done}/${sales.length}`);
    }
  }
  writeManifest(manifest);
  if (ASSESS) await assess();
  console.log(`\nDone. ${sales.length} cash sales across ${DAYS} days (${sales.filter((s) => s.isToday).length} today, ${voided} voided).`);
  if (totalMinor) console.log(`  sales total ≈ €${(totalMinor / 100).toFixed(2)} (re-sent sales are not double-counted)`);
  console.log(`  manifest: ${MANIFEST}  (run again with --undo to void these sales)`);
}

main().catch((e) => {
  console.error(`\nSeeding stopped: ${e.message}`);
  process.exit(1);
});
