/**
 * Evaluation export (plan §9.7, §9.3 backtest replay). Engineers only.
 *
 *   pnpm --filter api changes:evaluate -- --database-url postgres://… --merchant <uuid|publicId>
 *     [--from 2026-08-05] [--to 2026-09-28] [--trials 20] [--seed change-eval-v1]
 *     [--out ../../docs/evaluations/change-intelligence]
 *
 * The source database must be given explicitly (never read from .env) and is
 * read inside one READ ONLY, REPEATABLE READ transaction. Writes JSON and
 * Markdown. Generated fixtures prove mechanics, not real-world accuracy.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import * as schema from '../../database/schema';
import { ChangeSourceLoader } from '../change-source.loader';
import { createStore } from '../engine/fixtures';
import { addDays, localDate, localDayStart } from '../engine/local-time';
import { MODEL_VERSION } from '../engine/registry';
import {
  arithmeticChecks,
  dayRange,
  detectionPower,
  explanationCompleteness,
  forecastWape,
  percentile,
  propagationChecks,
  qualifyingCounts,
  replayDays,
  settingsWith,
  type History,
  type PowerCell,
} from './change-evaluation';

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

async function load(url: string, merchantRef: string, lastDay: string) {
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema });
  const loader = new ChangeSourceLoader();
  try {
    return await db.transaction(
      async (tx) => {
        const [merchant] = (
          await tx.execute(
            sql`SELECT id, public_id, business_name, timezone FROM merchants WHERE id::text = ${merchantRef} OR public_id = ${merchantRef}`,
          )
        ).rows as Array<{
          id: string;
          public_id: string;
          business_name: string;
          timezone: string;
        }>;
        if (!merchant) throw new Error(`Merchant ${merchantRef} not found`);
        const products = await loader.products(tx, merchant.id);
        const sales = await loader.sales(
          tx,
          merchant.id,
          new Date('2000-01-01T00:00:00Z'),
          localDayStart(addDays(lastDay, 1), merchant.timezone),
        );
        const [{ db: dbName }] = (
          await tx.execute(sql`SELECT current_database() AS db`)
        ).rows as Array<{ db: string }>;
        return { merchant, products, sales, dbName };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  } finally {
    await pool.end();
  }
}

const pct = (x: number | null) =>
  x === null ? '—' : `${(x * 100).toFixed(1)}%`;

async function main() {
  const url = arg('database-url');
  const merchantRef = arg('merchant');
  if (!url || !merchantRef)
    throw new Error('Pass --database-url and --merchant explicitly.');
  const from = arg('from', '2026-08-05')!;
  const to = arg('to', '2026-09-28')!;
  const trials = Number(arg('trials', '20'));
  const seed = arg('seed', 'change-eval-v1')!;
  const out = resolve(
    arg(
      'out',
      resolve(__dirname, '../../../../../docs/evaluations/change-intelligence'),
    )!,
  );
  const started = Date.now();

  const source = await load(url, merchantRef, to);
  const history: History = {
    merchantId: source.merchant.id,
    timezone: source.merchant.timezone,
    products: source.products,
    sales: source.sales,
  };
  const eligibleLines = source.sales.filter((l) => l.eligible && l.productId);
  const historyStart = eligibleLines
    .map((l) => localDate(l.occurredAt, history.timezone))
    .sort()[0];
  // Initialize where the 28-day forecast window first fits, then one clock run per day.
  const initDay = addDays(historyStart, 26);
  const replayFrom = addDays(initDay, 1);
  const store = (overrides = {}) =>
    createStore({
      merchantId: history.merchantId,
      timezone: history.timezone,
      settings: settingsWith(overrides),
    });

  // §2.3 qualifying evaluations at three thresholds (chosen baseline 3–4 weeks).
  const thresholds = [2.0, 2.5, 3.0].map((minZ) => {
    const records = replayDays(
      history,
      store({ minZ }),
      [initDay, ...dayRange(replayFrom, to)],
      history.sales,
      true,
    );
    return {
      minZ,
      records,
      counts: qualifyingCounts(
        history,
        records.filter((r) => r.day >= from && r.day <= to),
        minZ,
      ),
    };
  });
  const chosen = thresholds.find((t) => t.minZ === 2.5)!;
  const transactionQualifying = chosen.records
    .filter((r) => r.day >= from)
    .reduce(
      (n, r) =>
        n +
        Object.values(r.transactions).filter(
          (v) =>
            v.day === r.day &&
            v.assessment.readiness === 'ready' &&
            v.assessment.materiality?.qualifies,
        ).length,
      0,
    );

  // Injected shifts: sustained from 21 days before the end (day 0 = shiftStart).
  const shiftStart = addDays(to, -20);
  const power = detectionPower(history, {
    initDay,
    shiftStart,
    lastDay: to,
    multipliers: [1.25, 1.5, 2.0, 0.5],
    trials,
    settings: { minZ: 2.5 },
    seed,
  });
  const power30 = detectionPower(history, {
    initDay,
    shiftStart,
    lastDay: to,
    multipliers: [1.25, 1.5, 2.0, 0.5],
    trials,
    settings: { minZ: 3.0 },
    seed,
  });

  // Baseline weeks comparison (z ≥ 2.5, confirmation). 2 weeks is outside the allowed settings range (min 3).
  const baselineConfigs = [
    {
      label: '3 (fixed)',
      settings: { baselineWeeksMin: 3, baselineWeeksMax: 3 },
    },
    {
      label: '4 (fixed)',
      settings: { baselineWeeksMin: 4, baselineWeeksMax: 4 },
    },
    {
      label: '3–4 (chosen)',
      settings: { baselineWeeksMin: 3, baselineWeeksMax: 4 },
    },
  ].map((config) => {
    const records = replayDays(
      history,
      store(config.settings),
      [initDay, ...dayRange(replayFrom, to)],
      history.sales,
      true,
    );
    const counts = qualifyingCounts(
      history,
      records.filter((r) => r.day >= from),
      2.5,
    );
    const p = detectionPower(history, {
      initDay,
      shiftStart,
      lastDay: to,
      multipliers: [1.5, 2.0],
      trials,
      settings: { ...config.settings, minZ: 2.5 },
      seed,
    });
    return {
      label: config.label,
      historyNeededDays: 7 * (config.settings.baselineWeeksMin + 1),
      readyEvaluations: counts.evaluations,
      casesOnUnalteredData: counts.confirmedCases.length,
      caught50: p.cells[0].rate,
      caught100: p.cells[1].rate,
    };
  });

  // Confusion matrix (z ≥ 2.5): positives = injected trials; negatives = unaltered
  // product windows (same 21 days, no injection).
  const unalteredInWindow = chosen.counts.confirmedCases.filter(
    (c) => c.day >= shiftStart,
  );
  const productCount = history.products.filter(
    (p) => p.status === 'active',
  ).length;
  const positives = power.cells.reduce((n, c) => n + c.trials, 0);
  const tp = power.cells.reduce((n, c) => n + c.detected, 0);
  const fpProducts = new Set(unalteredInWindow.map((c) => c.productId)).size;
  const confusion = {
    truePositive: tp,
    falseNegative: positives - tp,
    falsePositive: fpProducts,
    trueNegative: productCount - fpProducts,
    note: 'Negatives are the unaltered product windows (21 days). Generated data may itself contain seeded trends; they are labelled negative here.',
  };

  const wape = forecastWape(history, chosen.records, historyStart, to);
  const arithmetic = arithmeticChecks(
    history,
    chosen.records.filter((r) => r.day >= from),
  );
  const explanations = explanationCompleteness(chosen.records);
  const latencies = chosen.records.map((r) => r.ms);

  // Propagation consistency on the final snapshot, busiest product.
  const finalStore = store();
  replayDays(
    history,
    finalStore,
    [initDay, ...dayRange(replayFrom, to)],
    history.sales,
    true,
  );
  const busiest = [...history.products].sort(
    (a, b) =>
      eligibleLines.filter((l) => l.productId === b.id).length -
      eligibleLines.filter((l) => l.productId === a.id).length,
  )[0];
  const propagation = propagationChecks(history, finalStore, to, busiest.id);

  const report = {
    generatedAt: new Date().toISOString(),
    modelVersion: MODEL_VERSION,
    source: {
      database: source.dbName,
      access: 'READ ONLY, REPEATABLE READ transaction',
      merchant: {
        id: source.merchant.id,
        publicId: source.merchant.public_id,
        name: source.merchant.business_name,
        timezone: history.timezone,
      },
      products: history.products.length,
      saleLines: source.sales.length,
      eligibleLinkedLines: eligibleLines.length,
      historyStart,
      lastDay: to,
    },
    method: {
      replay: `initialization on ${initDay}, then one daily clock evaluation per day at 01:00 local through ${to}`,
      countingWindow: { from, to },
      evaluation:
        'unit_demand_change, readiness ready, local day D evaluated that day',
      injection: {
        shiftStart,
        shiftedDays: dayRange(shiftStart, to).length,
        trials,
        seed,
        rule: 'each recorded unit becomes m units in expectation (binomial thinning for m<1, Bernoulli extra unit for fractional m>1)',
      },
      caveat:
        'Generated fixtures prove mechanical correctness; they do not establish real-world predictive accuracy. All current merchant data is generated test data.',
    },
    backtest: {
      reference: {
        evaluations: 549,
        qualifying: { '2.0': 44, '2.5': 20, '3.0': 8 },
        confirmed: { '2.5': 4, '3.0': 1 },
      },
      thresholds: thresholds.map((t) => t.counts),
      transactionQualifyingAt25: transactionQualifying,
    },
    detectionPower: { z25: power.cells, z30: power30.cells },
    baselineWeeks: baselineConfigs,
    falsePositivesOnUnalteredData: {
      z25: chosen.counts.confirmedCases.length,
      z30: thresholds[2].counts.confirmedCases.length,
      inShiftWindowZ25: unalteredInWindow.length,
    },
    confusionMatrix: confusion,
    forecastWape: wape,
    arithmetic,
    explanations,
    propagation: propagation.map((p) => ({ ...p, product: busiest.name })),
    latency: {
      dailyEvaluationMs: {
        samples: latencies.length,
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        max: Math.max(...latencies),
      },
      trialEvaluationMs: {
        samples: power.latenciesMs.length,
        p50: percentile(power.latenciesMs, 50),
        p95: percentile(power.latenciesMs, 95),
      },
      note: 'Pure engine time on this machine, in process; no database or job start-up.',
    },
    runtimeSeconds: (Date.now() - started) / 1000,
  };

  mkdirSync(out, { recursive: true });
  const base = `evaluation-${source.merchant.public_id}-${from}_${to}`;
  writeFileSync(
    resolve(out, `${base}.json`),
    JSON.stringify(report, null, 2) + '\n',
  );
  writeFileSync(resolve(out, `${base}.md`), markdown(report));
  console.log(
    JSON.stringify({
      written: [`${base}.json`, `${base}.md`],
      out,
      runtimeSeconds: report.runtimeSeconds,
    }),
  );
}

type Report = {
  generatedAt: string;
  modelVersion: string;
  source: {
    database: string;
    access: string;
    merchant: { publicId: string; name: string; timezone: string };
    products: number;
    saleLines: number;
    eligibleLinkedLines: number;
    historyStart: string;
    lastDay: string;
  };
  method: {
    replay: string;
    countingWindow: { from: string; to: string };
    injection: {
      shiftStart: string;
      shiftedDays: number;
      trials: number;
      seed: string;
      rule: string;
    };
    caveat: string;
  };
  backtest: {
    thresholds: Array<ReturnType<typeof qualifyingCounts>>;
    transactionQualifyingAt25: number;
  };
  detectionPower: { z25: PowerCell[]; z30: PowerCell[] };
  baselineWeeks: Array<{
    label: string;
    historyNeededDays: number;
    readyEvaluations: number;
    casesOnUnalteredData: number;
    caught50: number;
    caught100: number;
  }>;
  falsePositivesOnUnalteredData: {
    z25: number;
    z30: number;
    inShiftWindowZ25: number;
  };
  confusionMatrix: {
    truePositive: number;
    falseNegative: number;
    falsePositive: number;
    trueNegative: number;
    note: string;
  };
  forecastWape: ReturnType<typeof forecastWape>;
  arithmetic: ReturnType<typeof arithmeticChecks>;
  explanations: ReturnType<typeof explanationCompleteness>;
  propagation: Array<{
    scenario: string;
    product: string;
    invoked: string[];
    unexpected: string[];
    missing: string[];
    demandCalculatorsInvoked: string[];
    selectiveVsFull: { states: number; differing: string[] };
    laterSameDay: { differing: string[] };
    selectiveMs: number;
  }>;
  latency: {
    dailyEvaluationMs: {
      samples: number;
      p50: number | null;
      p95: number | null;
      max: number;
    };
    trialEvaluationMs: {
      samples: number;
      p50: number | null;
      p95: number | null;
    };
    note: string;
  };
  runtimeSeconds: number;
};

function markdown(r: Report): string {
  const ref: Record<string, number> = { '2': 44, '2.5': 20, '3': 8 };
  const refConfirmed: Record<string, string> = {
    '2': '—',
    '2.5': '4',
    '3': '1',
  };
  const lines = [
    `# Change Intelligence evaluation — ${r.source.merchant.name} (${r.source.merchant.publicId})`,
    '',
    `Generated ${r.generatedAt} · model \`${r.modelVersion}\` · source database \`${r.source.database}\` (${r.source.access}).`,
    '',
    `> ${r.method.caveat}`,
    '',
    '## Method',
    '',
    `- History: ${r.source.products} products, ${r.source.saleLines} sale lines (${r.source.eligibleLinkedLines} eligible and linked), ${r.source.historyStart} – ${r.source.lastDay}, ${r.source.merchant.timezone}.`,
    `- Replay: ${r.method.replay}, with the real engine (\`evaluateMerchant\`).`,
    `- Counting window: ${r.method.countingWindow.from} – ${r.method.countingWindow.to}.`,
    `- Injection: sustained shift from ${r.method.injection.shiftStart} (${r.method.injection.shiftedDays} days to the end), ${r.method.injection.trials} trials per product, seed \`${r.method.injection.seed}\`; ${r.method.injection.rule}.`,
    '',
    '## §2.3 backtest replay (unit demand)',
    '',
    '| Rule | Ready evaluations | Qualifying (reference) | Qualifying (this run) | Increase / decrease | Confirmed cases (reference) | Confirmed cases (this run) |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...r.backtest.thresholds.map(
      (t) =>
        `| z ≥ ${t.minZ.toFixed(1)} | ${t.evaluations} (ref. 549) | ${ref[String(t.minZ)]} | ${t.qualifying} | ${t.qualifyingIncrease} / ${t.qualifyingDecrease} | ${refConfirmed[String(t.minZ)]} | ${t.confirmedCases.length} |`,
    ),
    '',
    `Transaction-count evaluations qualifying at z ≥ 2.5: ${r.backtest.transactionQualifyingAt25}.`,
    '',
    ...r.backtest.thresholds.flatMap((t) => [
      `Confirmed unit-demand cases at z ≥ ${t.minZ.toFixed(1)}:`,
      '',
      ...(t.confirmedCases.length
        ? t.confirmedCases.map(
            (c) => `- ${c.day} — ${c.productName}: ${c.type}`,
          )
        : ['- none']),
      '',
    ]),
    '## Injected-shift detection power',
    '',
    '| Shift | z ≥ 2.5 detected | median lag (days) | z ≥ 3.0 detected | median lag | wrong direction (2.5) |',
    '|---|---:|---:|---:|---:|---:|',
    ...r.detectionPower.z25.map((c, i) => {
      const c30 = r.detectionPower.z30[i];
      return `| ×${c.multiplier} | ${pct(c.rate)} (${c.detected}/${c.trials}) | ${c.medianLagDays ?? '—'} | ${pct(c30.rate)} (${c30.detected}/${c30.trials}) | ${c30.medianLagDays ?? '—'} | ${c.wrongDirection} |`;
    }),
    '',
    '## Baseline weeks (z ≥ 2.5, with confirmation)',
    '',
    '| Baseline weeks | History needed | Ready evaluations | Cases on unaltered data | +50% caught | ×2 caught |',
    '|---|---:|---:|---:|---:|---:|',
    ...r.baselineWeeks.map(
      (b) =>
        `| ${b.label} | ${b.historyNeededDays} days | ${b.readyEvaluations} | ${b.casesOnUnalteredData} | ${pct(b.caught50)} | ${pct(b.caught100)} |`,
    ),
    '| 2 | 21 days | not run: `baselineWeeksMin` < 3 is rejected by settings validation | | | |',
    '',
    '## False positives and confusion matrix (z ≥ 2.5)',
    '',
    `Cases opened on unaltered data over the counting window: ${r.falsePositivesOnUnalteredData.z25} at z ≥ 2.5, ${r.falsePositivesOnUnalteredData.z30} at z ≥ 3.0 (${r.falsePositivesOnUnalteredData.inShiftWindowZ25} inside the 21-day shift window).`,
    '',
    '| | Predicted change | Predicted no change |',
    '|---|---:|---:|',
    `| Injected shift | ${r.confusionMatrix.truePositive} | ${r.confusionMatrix.falseNegative} |`,
    `| No injected shift | ${r.confusionMatrix.falsePositive} | ${r.confusionMatrix.trueNegative} |`,
    '',
    r.confusionMatrix.note,
    '',
    '## 7-day forecast WAPE (28-day rate)',
    '',
    `WAPE ${pct(r.forecastWape.wape)} over ${r.forecastWape.evaluations} product-day evaluations (${r.forecastWape.firstDay} – ${r.forecastWape.lastDay}); forecast-ready only: ${pct(r.forecastWape.readyOnlyWape)} over ${r.forecastWape.forecastReadyEvaluations}. Reference: 26.1% over 560.`,
    '',
    '## Arithmetic, explanations, propagation, latency',
    '',
    `- Arithmetic: ${r.arithmetic.checked} values recomputed independently from raw daily totals (R, weekly totals, E, s², z, 28-day rate); ${r.arithmetic.mismatches} mismatches.`,
    `- Explanations: ${r.explanations.operations} case operations; ${r.explanations.incomplete} missing a headline, summary, values, product name, observation period or consequence.`,
    ...r.propagation.map(
      (p) =>
        `- ${p.scenario} on ${p.product}: invoked ${p.invoked.length} node(s) [${p.invoked.join(', ')}]; unexpected ${p.unexpected.length}, missing ${p.missing.length}, demand calculators invoked ${p.demandCalculatorsInvoked.length}; selective vs full re-evaluation at the same instant: ${p.selectiveVsFull.differing.length} of ${p.selectiveVsFull.states} states differ; differing at the same instant: [${p.selectiveVsFull.differing.map((k) => k.split(':')[0]).join(', ') || 'none'}]; eight hours later the same day: ${p.laterSameDay.differing.length} differ [${[...new Set(p.laterSameDay.differing.map((k) => k.split(':')[0]))].join(', ') || 'none'}]; ${p.selectiveMs.toFixed(1)} ms.`,
    ),
    '',
    '### Findings from the propagation check',
    '',
    '- `projected_stock_dates` of products a selective run does not touch are dated from the instant of the run that last computed them (the daily evaluation). A full re-evaluation later the same day re-dates them from its own instant, so the two differ by design until the next daily evaluation.',
    '- A full re-evaluation (reconciliation or model upgrade) recomputes a changed minimum, cover and risk, but does not open a "stock threshold changed" case: that case requires a captured threshold source change (`d.fields(pid).includes(\'threshold\')` in `engine/evaluate.ts`). A reconciliation after a capture gap therefore does not report threshold edits made during the gap. Flagged for review; the engine was not changed.',
    '',
    `- Daily evaluation (whole merchant, pure engine): p50 ${r.latency.dailyEvaluationMs.p50?.toFixed(1)} ms, p95 ${r.latency.dailyEvaluationMs.p95?.toFixed(1)} ms over ${r.latency.dailyEvaluationMs.samples} runs. ${r.latency.note}`,
    '',
    `Runtime ${r.runtimeSeconds.toFixed(1)} s. UI acceptance results are recorded at Stage 7.`,
    '',
  ];
  return lines.join('\n');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
