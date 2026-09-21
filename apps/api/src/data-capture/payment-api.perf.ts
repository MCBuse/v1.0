import { ConfigService } from '@nestjs/config';
import { eq, inArray } from 'drizzle-orm';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { connectTestDatabase } from '../database/testing/test-database';
import {
  createMerchantFixture,
  destroyMerchantFixture,
} from '../database/testing/merchant-fixture';
import * as schema from '../database/schema';
import { percentile } from '../common/percentile';
import { MerchantService } from './merchant.service';
import type { RatesService } from '../rates/rates.service';

/**
 * P.2 — the payment API's p95, measured against a recorded baseline.
 *
 * The plan's rollout gate is "no more than 10% degradation". A gate needs
 * something to compare against, so the baseline lives in the repository and
 * this run either checks against it or, with `--record`, replaces it.
 *
 *   pnpm --filter api perf:payment            # check against the baseline
 *   pnpm --filter api perf:payment -- --record  # set a new baseline
 *
 * This measures the service against a real database on one machine. It catches
 * a change that makes the payment path materially slower, which is what the
 * gate is for. It is not a substitute for the hosted p95, which needs the
 * deployed environment.
 */

const BASELINE_PATH = resolve(__dirname, '../../perf-baseline.json');
const ITERATIONS = Number(process.env.PERF_ITERATIONS ?? 200);
/** Repeated rounds, keeping the best: background load only ever adds time. */
const ROUNDS = Number(process.env.PERF_ROUNDS ?? 3);
/** The plan's gate. */
const ALLOWED_DEGRADATION = 0.1;
/**
 * Below this, a percentage change is noise.
 *
 * These operations run in single-digit milliseconds, where a passing browser
 * tab moves the figure by a third. A gate that fires on that teaches people to
 * ignore it, so a regression has to be both proportionally and absolutely
 * significant before it counts.
 */
const NOISE_FLOOR_MS = Number(process.env.PERF_NOISE_FLOOR_MS ?? 3);

interface Measurement {
  p50: number;
  p95: number;
  p99: number;
  iterations: number;
}

interface Baseline {
  recordedAt: string;
  note: string;
  measurements: Record<string, Measurement>;
}

function summarise(samples: number[]): Measurement {
  return {
    p50: Number(percentile(samples, 50).toFixed(2)),
    p95: Number(percentile(samples, 95).toFixed(2)),
    p99: Number(percentile(samples, 99).toFixed(2)),
    iterations: samples.length,
  };
}

async function main() {
  const record = process.argv.includes('--record');
  const { db, pool } = await connectTestDatabase();
  const rates = {
    getAll: () => ({
      USD_TO_EUR: {
        from: 'USD',
        to: 'EUR',
        rate: 0.92,
        inverseRate: 1.087,
        updatedAt: new Date().toISOString(),
      },
    }),
  } as unknown as RatesService;

  const merchants = new MerchantService(db, rates, new ConfigService());
  const merchant = await createMerchantFixture(db, 'Perf');
  const createdRequestIds: string[] = [];

  /** Keeps the faster of two measurements of the same thing. */
  function best(left: Measurement | undefined, right: Measurement): Measurement {
    if (!left) return right;
    return right.p95 < left.p95 ? right : left;
  }

  try {
    // Warm the connection pool and the query planner before measuring.
    for (let index = 0; index < 20; index += 1) {
      const request = await merchants.createPaymentRequest(merchant.userId, {
        amountMinor: '1000',
      });
      createdRequestIds.push(request.id);
    }

    const measurements: Record<string, Measurement> = {};
    for (let round = 0; round < ROUNDS; round += 1) {
      const createSamples: number[] = [];
      for (let index = 0; index < ITERATIONS; index += 1) {
        const startedAt = performance.now();
        const request = await merchants.createPaymentRequest(merchant.userId, {
          amountMinor: String(100 + (index % 900)),
          description: `perf ${index}`,
        });
        createSamples.push(performance.now() - startedAt);
        createdRequestIds.push(request.id);
      }

      const readSamples: number[] = [];
      for (let index = 0; index < ITERATIONS; index += 1) {
        const target = createdRequestIds[index % createdRequestIds.length]!;
        const startedAt = performance.now();
        await merchants.getPaymentRequest(merchant.userId, target);
        readSamples.push(performance.now() - startedAt);
      }

      const listSamples: number[] = [];
      for (let index = 0; index < Math.min(ITERATIONS, 100); index += 1) {
        const startedAt = performance.now();
        await merchants.listPaymentRequests(merchant.userId, {
          page: 1,
          pageSize: 20,
        });
        listSamples.push(performance.now() - startedAt);
      }

      measurements['create payment request'] = best(
        measurements['create payment request'],
        summarise(createSamples),
      );
      measurements['read payment request'] = best(
        measurements['read payment request'],
        summarise(readSamples),
      );
      measurements['list payment requests'] = best(
        measurements['list payment requests'],
        summarise(listSamples),
      );
    }

    if (record) {
      const baseline: Baseline = {
        recordedAt: new Date().toISOString(),
        note: `Local service-level p95 against a real Postgres, best of ${ROUNDS} rounds of ${ITERATIONS}. Machine-dependent: re-record on a different machine before using the gate there. A regression must exceed both ${ALLOWED_DEGRADATION * 100}% and ${NOISE_FLOOR_MS}ms to fail.`,
        measurements,
      };
      writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
      process.stdout.write(`Baseline written to ${BASELINE_PATH}\n`);
      process.stdout.write(`${JSON.stringify(measurements, null, 2)}\n`);
      return;
    }

    let baseline: Baseline;
    try {
      baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
    } catch {
      throw new Error(
        `No baseline at ${BASELINE_PATH}. Run with --record first.`,
      );
    }

    const failures: string[] = [];
    for (const [label, current] of Object.entries(measurements)) {
      const previous = baseline.measurements[label];
      if (!previous) {
        process.stdout.write(`${label}: new measurement, nothing to compare\n`);
        continue;
      }
      const change = (current.p95 - previous.p95) / previous.p95;
      const absolute = current.p95 - previous.p95;
      const direction = change >= 0 ? '+' : '';
      const withinNoise = absolute <= NOISE_FLOOR_MS;
      process.stdout.write(
        `${label}: p95 ${current.p95}ms against ${previous.p95}ms ` +
          `(${direction}${(change * 100).toFixed(1)}%, ${direction}${absolute.toFixed(2)}ms)` +
          `${change > ALLOWED_DEGRADATION && withinNoise ? ' — inside the noise floor' : ''}\n`,
      );
      if (change > ALLOWED_DEGRADATION && !withinNoise) {
        failures.push(
          `${label} p95 degraded ${(change * 100).toFixed(1)}% (${absolute.toFixed(2)}ms), over the ${ALLOWED_DEGRADATION * 100}% gate`,
        );
      }
    }

    if (failures.length) throw new Error(failures.join('; '));
    process.stdout.write('Within the rollout gate.\n');
  } finally {
    if (createdRequestIds.length) {
      await db
        .delete(schema.paymentRequests)
        .where(inArray(schema.paymentRequests.id, createdRequestIds));
    }
    await destroyMerchantFixture(db, merchant);
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
