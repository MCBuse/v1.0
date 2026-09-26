#!/usr/bin/env node
/**
 * Seeds SYNTHETIC demo activity into a LOCAL MCBuse API so the merchant
 * Overview can be reviewed with realistic-looking data.
 *
 *   SEED_EMAIL=you@example.com SEED_PASSWORD='…' \
 *     node scripts/seed-local-overview-demo.mjs [--api http://localhost:4000/api/v1] [--days 90]
 *
 * What it creates (all through the public merchant API, never raw SQL):
 *   - ~10 café products, SKU prefix "SYN-", described as synthetic demo data.
 *   - Backdated merchant-recorded cash sales over the last N days, each
 *     described "Synthetic demo sale", with Idempotency-Key prefix
 *     "synthetic-overview-seed:v1:".
 *
 * Safety:
 *   - Refuses any API that is not localhost / 127.0.0.1.
 *   - Deterministic and idempotent: re-running on the same or a later day
 *     never duplicates sales; later runs only add the days since.
 *   - Does not touch wallets, balances, digital payments, assessments,
 *     consent or Finance Match. Those stay as they really are.
 */
import process from 'node:process';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const API = arg('api', 'http://localhost:4000/api/v1').replace(/\/$/, '');
const DAYS = Math.min(Math.max(Number(arg('days', '90')), 1), 180);
const EMAIL = process.env.SEED_EMAIL?.trim().toLowerCase();
const PASSWORD = process.env.SEED_PASSWORD;
const TZ = 'Europe/Berlin'; // provision-merchant default
const KEY_PREFIX = 'synthetic-overview-seed:v1';
const PACE_MS = 700; // local throttle is 100 req/min

const host = new URL(API).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to seed ${API}: synthetic data is only allowed against a local API.`);
  process.exit(1);
}
if (!EMAIL || !PASSWORD) {
  console.error('Set SEED_EMAIL and SEED_PASSWORD for the local merchant account.');
  process.exit(1);
}

/* ------------------------------------------------------------ catalogue */
// price in EUR cents; weight = relative popularity; endStock = stock left after seeding
const CATALOGUE = [
  { sku: 'SYN-ESP', name: 'Espresso', category: 'Coffee', price: 220, weight: 14, endStock: 60 },
  { sku: 'SYN-CAP', name: 'Cappuccino', category: 'Coffee', price: 340, weight: 18, endStock: 55 },
  { sku: 'SYN-FLW', name: 'Flat white', category: 'Coffee', price: 360, weight: 12, endStock: 40 },
  { sku: 'SYN-TEA', name: 'Black tea', category: 'Tea', price: 250, weight: 6, endStock: 30 },
  { sku: 'SYN-CRO', name: 'Butter croissant', category: 'Bakery', price: 280, weight: 13, endStock: 3 },
  { sku: 'SYN-PAC', name: 'Pain au chocolat', category: 'Bakery', price: 310, weight: 9, endStock: 22 },
  { sku: 'SYN-SOU', name: 'Sourdough loaf', category: 'Bakery', price: 650, weight: 4, endStock: 2 },
  { sku: 'SYN-BAN', name: 'Banana bread slice', category: 'Bakery', price: 350, weight: 5, endStock: 18 },
  { sku: 'SYN-SAN', name: 'Ham and cheese sandwich', category: 'Lunch', price: 690, weight: 8, endStock: 4 },
  { sku: 'SYN-JUI', name: 'Fresh orange juice', category: 'Drinks', price: 420, weight: 5, endStock: 25 },
];
const LOW_STOCK_THRESHOLD = 5;

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
    const growth = 1 + (DAYS - back) / DAYS * 0.35; // gentle upward trend
    const base = weekday === 6 ? 7 : weekday === 5 ? 6 : 4;
    const count = Math.max(1, Math.round((base + r() * 3) * growth));
    for (let n = 0; n < count; n++) {
      const w = pickWeighted(r, WINDOWS, (x) => x.weight);
      const minutes = Math.floor(w.from + r() * (w.to - w.from));
      const occurredAt = localToUtc(ymd, minutes);
      const lines = [];
      const lineCount = r() < 0.55 ? 1 : r() < 0.8 ? 2 : 3;
      const used = new Set();
      for (let l = 0; l < lineCount; l++) {
        const p = pickWeighted(r, CATALOGUE, (x) => x.weight);
        if (used.has(p.sku)) continue;
        used.add(p.sku);
        lines.push({ sku: p.sku, quantity: r() < 0.8 ? 1 : 2 });
      }
      if (r() < 0.05) lines.push({ custom: true, name: 'Catering tray (custom order)', unitPriceMinor: String(1800 + Math.floor(r() * 12) * 100), quantity: 1 });
      sales.push({ key: `${KEY_PREFIX}:${ymd}:${n}`, occurredAt, lines, isToday: ymd === today });
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
async function main() {
  console.log(`Seeding synthetic demo data into ${API} for ${EMAIL} (${DAYS} days, ${TZ})`);
  const login = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  token = login.accessToken;
  if (!token) throw new Error('Login did not return an access token');
  await call('GET', '/merchants/me'); // fails early if the account has no merchant

  const now = new Date();
  const sales = planSales(now);

  // Opening stock = planned usage + intended stock left (a few end below threshold).
  const usage = Object.fromEntries(CATALOGUE.map((p) => [p.sku, 0]));
  for (const s of sales) for (const l of s.lines) if (l.sku) usage[l.sku] += l.quantity;

  const existing = new Map((await listAllProducts()).filter((p) => p.sku?.startsWith('SYN-')).map((p) => [p.sku, p]));
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
      description: 'Synthetic demo data (local only)',
      unitPriceMinor: String(p.price),
      quantity: usage[p.sku] + p.endStock,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
    });
    productIds[p.sku] = created.id;
    console.log(`  product ${p.sku} ${p.name} (stock ${usage[p.sku] + p.endStock})`);
  }

  let done = 0;
  let totalMinor = 0;
  for (const sale of sales) {
    const lines = sale.lines.map((l) =>
      l.custom
        ? { type: 'custom', name: l.name, unitPriceMinor: l.unitPriceMinor, quantity: l.quantity }
        : { type: 'product', productId: productIds[l.sku], quantity: l.quantity },
    );
    const body = { lines, description: 'Synthetic demo sale', occurredAt: sale.occurredAt.toISOString() };
    try {
      const res = await call('POST', '/merchants/me/cash-sales', body, { 'idempotency-key': sale.key });
      totalMinor += Number(res?.amountMinor ?? res?.amount?.minor ?? 0);
    } catch (e) {
      if (e.status === 409 && /stock/i.test(e.message)) {
        // A later re-run can outgrow the opening stock: restock, then retry once.
        for (const l of sale.lines) if (l.sku)
          await call('POST', `/merchants/me/products/${productIds[l.sku]}/stock-adjustments`, { reason: 'restock', change: 50 });
        await call('POST', '/merchants/me/cash-sales', body, { 'idempotency-key': sale.key });
      } else throw e;
    }
    done++;
    if (done % 25 === 0 || done === sales.length) process.stdout.write(`\r  cash sales ${done}/${sales.length}`);
  }
  console.log(`\nDone. ${sales.length} synthetic cash sales across ${DAYS} days (${sales.filter((s) => s.isToday).length} today).`);
  if (totalMinor) console.log(`  new sales total ≈ €${(totalMinor / 100).toFixed(2)} (re-sent sales are not double-counted)`);
  console.log('Reload http://localhost:3001/overview.');
}

main().catch((e) => {
  console.error(`\nSeeding stopped: ${e.message}`);
  process.exit(1);
});
