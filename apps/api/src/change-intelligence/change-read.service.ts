import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type {
  ChangeCaseStatus,
  ChangeCaseSummary,
  ChangeCaseType,
  ChangeDetailResponse,
  ChangeListResponse,
  ChangeLocalPeriod,
  ChangeProcessingState,
  ChangeProductReadiness,
  ChangeReadiness,
  ChangeRunEvidence,
  ChangeSourceInformation,
  ChangeStatusResponse,
  ChangeTrailStep,
  ChangeTransitionEntry,
  ChangeTypeFilter,
  ChangeValue,
  ChangeDataProvenance,
  MerchantInsight,
  RunReason,
  StockRiskLevel,
} from '@repo/shared';
import { DRIZZLE, type DrizzleDB } from '../database/database.provider';
import * as schema from '../database/schema';
import {
  ChangeIntelligenceConfig,
  type MerchantIdentity,
} from './change-intelligence.config';
import type { ChangeCoverage } from './change-source.loader';
import { formatNumber } from './engine/explanations';
import {
  addDays,
  completedLocalDay,
  daysBetween,
  localDate,
  localDayStart,
} from './engine/local-time';
import {
  MODEL_VERSION,
  REGISTRY_NODES,
  validateRegistry,
} from './engine/registry';
import { requiredHistoryDays, windowsFor } from './engine/rules';
import type {
  AdjustedDemandValue,
  CaseExplanation,
  CaseFacts,
  DemandChangeValue,
  MerchantRecordingValue,
  NodeKey,
} from './engine/types';

/**
 * Local copy of `CHANGE_TYPE_FILTER_GROUPS` (@repo/shared is source-only at
 * runtime); change-read.spec.ts keeps them equal.
 */
export const CHANGE_TYPE_GROUPS: Record<ChangeTypeFilter, ChangeCaseType[]> = {
  demand: [
    'transaction_velocity_increase',
    'transaction_velocity_decrease',
    'unit_demand_increase',
    'unit_demand_decrease',
  ],
  stock: ['stock_risk'],
  threshold: ['stock_threshold_change'],
  correction: ['historical_correction'],
};

export const DEFAULT_LIMIT = 25;
export const DEFAULT_RANGE_DAYS = 30;
export const MAX_RANGE_DAYS = 366;
/** Pending work older than this, or a failed lease, is "delayed" (plan §8 alerting). */
export const DELAYED_AFTER_MINUTES = 75;

/**
 * Processing columns over `merchant_change_work w` (may be a LEFT JOIN).
 * Shared by the merchant status API and the staff merchant picker.
 */
export const WORK_PROCESSING_SQL = {
  columns: sql`(w.status = 'processing' AND w.lease_until > now()) AS processing,
    (w.status = 'failed' OR (w.last_failure_at IS NOT NULL
      AND (w.last_success_at IS NULL OR w.last_failure_at > w.last_success_at))) AS failed,
    p.pending_since,
    p.pending_since < now() - make_interval(mins => ${DELAYED_AFTER_MINUTES}) AS delayed`,
  lateral: sql`CROSS JOIN LATERAL (
    SELECT CASE WHEN w.requested_revision > w.processed_revision THEN COALESCE(
      (SELECT min(e.created_at) FROM merchant_change_events e
        WHERE e.merchant_id = w.merchant_id AND e.status = 'pending'),
      w.last_requested_at) END AS pending_since
  ) p`,
};

export type WorkProcessingRow = {
  processing: boolean | null;
  failed: boolean | null;
  pending_since: string | Date | null;
  delayed: boolean | null;
};

export function processingState(
  work: WorkProcessingRow | undefined,
): ChangeProcessingState {
  if (!work) return 'idle';
  if (work.processing) return 'processing';
  if (work.failed) return 'failed';
  if (work.delayed) return 'delayed';
  return work.pending_since ? 'pending' : 'idle';
}
const HISTORY_LIMIT = 100;

export const PROJECTION_ASSUMPTION =
  'Projections exclude opening hours, supplier lead times, incoming orders and unrecorded activity.';

/** Merchant identity from owner resolution; never client supplied. */
export type ChangeMerchant = {
  merchantId: string;
  publicId: string;
  timezone: string;
};

export type ListChangesQuery = {
  productId?: string;
  type?: ChangeTypeFilter;
  status?: 'active' | 'resolved' | 'all';
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
};

// ---------------------------------------------------------------- cursor

/** `a` = attention order (active view, §3.4); `t` = most recent first. */
type Ordering = 'a' | 't';
type Cursor = { o: Ordering; p: number | null; t: string; i: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MICRO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/** Opaque, validated: anything that is not a cursor this view issued is a 400. */
export function decodeCursor(raw: string, ordering: Ordering): Cursor {
  const invalid = () => new BadRequestException('Invalid cursor');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (!parsed || typeof parsed !== 'object') throw invalid();
  const { o, p, t, i } = parsed as Record<string, unknown>;
  if (o !== ordering) throw invalid();
  if (typeof t !== 'string' || !MICRO_TIMESTAMP.test(t) || isNaN(Date.parse(t)))
    throw invalid();
  if (typeof i !== 'string' || !UUID.test(i)) throw invalid();
  if (ordering === 'a') {
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 1 || p > 5)
      throw invalid();
    return { o: ordering, p, t, i };
  }
  if (p !== null) throw invalid();
  return { o: ordering, p: null, t, i };
}

// ---------------------------------------------------------------- mapping

type CaseEvidence = {
  facts?: CaseFacts;
  explanation?: CaseExplanation;
  before?: ChangeValue[];
  after?: ChangeValue[];
  observation?: ChangeLocalPeriod | null;
};

type CaseRow = typeof schema.merchantChangeCases.$inferSelect;
type ProductRef = { name: string | null; status: string | null };

/** Whitelists ChangeValue fields so nothing else stored alongside them can leak. */
const safeValues = (values: unknown): ChangeValue[] =>
  Array.isArray(values)
    ? (values as ChangeValue[]).map((v) => {
        const out: ChangeValue = {
          key: v.key,
          label: v.label,
          value: v.value,
          unit: v.unit,
        };
        if (v.reason !== undefined) out.reason = v.reason;
        return out;
      })
    : [];

const safePeriod = (
  period: ChangeLocalPeriod | null | undefined,
): ChangeLocalPeriod | null =>
  period ? { from: period.from, to: period.to } : null;

/** Saved values of a case's opening entry and of its latest entry with values. */
type CaseReadings = { opening: unknown; latest: unknown };

/**
 * Before = the state when the change was detected (the opening entry, §3.5);
 * Now = the latest saved values. The case evidence only keeps the latest
 * update's own before/after, so the opening entry wins when it still exists.
 */
function summarize(
  row: CaseRow,
  product: ProductRef,
  readings?: CaseReadings,
): ChangeCaseSummary {
  const evidence = (row.evidence ?? {}) as CaseEvidence;
  const opening = safeValues(readings?.opening);
  const latest = safeValues(evidence.after);
  const explanation = evidence.explanation;
  return {
    id: row.id,
    productId: row.productId,
    productName: product.name ?? evidence.facts?.productName ?? null,
    productAvailable: product.status === 'active',
    type: row.caseType,
    status: row.status,
    severity: row.severity,
    priority: row.priority as ChangeCaseSummary['priority'],
    headline: explanation?.headline ?? '',
    summary: explanation?.summary ?? '',
    consequence: explanation?.consequence ?? null,
    suggestedAction: explanation?.suggestedAction ?? null,
    firstDetectedAt: row.firstDetectedAt.toISOString(),
    lastChangedAt: row.lastChangedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolution: row.resolution ?? null,
    identifiedDuringInitialAnalysis: row.identifiedDuringInitialAnalysis,
    notRecheckedSince: row.notRecheckedSince ?? null,
    observation: safePeriod(evidence.observation),
    before: opening.length ? opening : safeValues(evidence.before),
    after: latest.length ? latest : safeValues(readings?.latest),
    modelVersion: row.modelVersion,
  };
}

const SOURCE_LIMITATIONS = [
  'Only activity recorded in MCBuse is included. It may not cover all of your business.',
  'Cash sales do not record whether they are live or test activity.',
];

function sourceInfo(raw: unknown): ChangeSourceInformation {
  const coverage = (raw ?? {}) as Partial<ChangeCoverage>;
  const unassignedLines = coverage.unassignedLines ?? 0;
  return {
    digitalSalesByEnvironment: {
      ...(coverage.digitalSalesByEnvironment ?? {}),
    },
    cashSales: coverage.cashSales ?? 0,
    cashSalesProvenance: 'unknown',
    unassignedLines,
    excludedObservations: coverage.excludedObservations ?? 0,
    includesTestPayments: coverage.includesTestPayments ?? false,
    limitations: unassignedLines
      ? [
          ...SOURCE_LIMITATIONS,
          `${unassignedLines} recorded sale line${unassignedLines === 1 ? ' is' : 's are'} not linked to a product and ${unassignedLines === 1 ? 'is' : 'are'} not counted toward product demand.`,
        ]
      : SOURCE_LIMITATIONS,
  };
}

/** Merchant labels for the dependency trail, and which explained value each step shows. */
const TRAIL: Record<NodeKey, { label: string; value: string }> = {
  merchant_recording_activity: {
    label: 'Sales recorded across all products',
    value: 'recent_units',
  },
  product_transaction_activity: { label: 'Recorded sales', value: 'recent' },
  product_unit_activity: { label: 'Recorded units', value: 'recent' },
  transaction_change: { label: 'How often it is bought', value: 'recent' },
  unit_demand_change: {
    label: 'Units sold compared with usual',
    value: 'recent',
  },
  baseline_daily_demand: { label: 'Usual daily demand', value: 'per_day' },
  adjusted_daily_demand: {
    label: 'Daily demand used for projections',
    value: 'per_day',
  },
  available_stock: { label: 'Available stock', value: 'available' },
  minimum_stock_policy: { label: 'Minimum stock', value: 'minimum' },
  stock_cover: { label: 'Days until minimum stock', value: 'days_to_minimum' },
  projected_stock_dates: {
    label: 'Expected date of minimum stock',
    value: 'minimum_date',
  },
  replenishment_guidance: {
    label: 'Suggested quantity for the coming week',
    value: 'suggested_units',
  },
  stock_risk: { label: 'Stock risk', value: 'risk' },
  merchant_change_summary: { label: 'Active changes', value: 'active_changes' },
};
const NODE_ORDER = validateRegistry().order;
const NODES = new Map(REGISTRY_NODES.map((node) => [node.key, node]));

const RISK_LABEL: Record<StockRiskLevel, string> = {
  out_of_stock: 'Out of stock',
  low_stock: 'At or below minimum',
  projected_stock_risk: 'May reach minimum soon',
  forecast_unavailable: 'Outlook unavailable',
  normal: 'Normal',
};
const UNIT_LABEL: Partial<Record<ChangeValue['unit'], string>> = {
  units: 'units',
  sales: 'sales',
  days: 'days',
  weeks: 'weeks',
  units_per_day: 'units per day',
};

function displayValue(value: ChangeValue): string {
  if (value.value === null) return 'Unavailable';
  if (typeof value.value === 'string')
    return value.unit === 'risk'
      ? (RISK_LABEL[value.value as StockRiskLevel] ?? value.value)
      : value.value;
  const unit = UNIT_LABEL[value.unit];
  return unit
    ? `${formatNumber(value.value)} ${unit}`
    : formatNumber(value.value);
}

/** Case types Deep Analytics reads through the adapter (§2.5). */
const AUTHORITATIVE_TYPES: ChangeCaseType[] = [
  'stock_risk',
  'unit_demand_increase',
  'unit_demand_decrease',
];

// ---------------------------------------------------------------- service

/**
 * Merchant read side of Change Intelligence (plan §7) and the Deep Analytics
 * compatibility adapter (§2.5). Every query is scoped by the merchant from
 * owner resolution. Responses carry only merchant-safe fields: no node keys,
 * z-scores, fingerprints, lease tokens or event ids.
 */
@Injectable()
export class ChangeReadService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly config: ChangeIntelligenceConfig,
  ) {}

  private enabled(merchant: ChangeMerchant): boolean {
    return this.config.isEnabledFor({
      id: merchant.merchantId,
      publicId: merchant.publicId,
      isActive: true,
    });
  }

  /** List, detail and run evidence are 404 when the feature is off for the merchant. */
  private assertAvailable(merchant: ChangeMerchant): void {
    if (!this.enabled(merchant)) throw new NotFoundException();
  }

  async list(
    merchant: ChangeMerchant,
    query: ListChangesQuery,
  ): Promise<ChangeListResponse> {
    this.assertAvailable(merchant);
    const c = schema.merchantChangeCases;
    const p = schema.merchantProducts;
    const status = query.status ?? 'active';
    const limit = query.limit ?? DEFAULT_LIMIT;
    const ordering: Ordering = status === 'active' ? 'a' : 't';
    const conditions: SQL[] = [eq(c.merchantId, merchant.merchantId)];
    if (status !== 'all') conditions.push(eq(c.status, status));
    if (query.productId) conditions.push(eq(c.productId, query.productId));
    if (query.type)
      conditions.push(inArray(c.caseType, CHANGE_TYPE_GROUPS[query.type]));

    const range = this.range(merchant.timezone, query, status);
    if (range)
      conditions.push(
        gte(c.lastChangedAt, range.start),
        lt(c.lastChangedAt, range.end),
      );

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor, ordering);
      const after = sql`(${c.lastChangedAt}, ${c.id}) < (${cursor.t}::timestamptz, ${cursor.i}::uuid)`;
      conditions.push(
        ordering === 'a'
          ? sql`(${c.priority} > ${cursor.p} OR (${c.priority} = ${cursor.p} AND ${after}))`
          : after,
      );
    }

    const rows = await this.db
      .select({
        row: c,
        productName: p.name,
        productStatus: p.status,
        cursorAt: sql<string>`to_char(${c.lastChangedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(c)
      .leftJoin(p, and(eq(p.id, c.productId), eq(p.merchantId, c.merchantId)))
      .where(and(...conditions))
      .orderBy(
        ...(ordering === 'a' ? [asc(c.priority)] : []),
        desc(c.lastChangedAt),
        desc(c.id),
      )
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const readings = await this.readings(
      merchant.merchantId,
      page.map((r) => r.row.id),
    );
    return {
      items: page.map((r) =>
        summarize(
          r.row,
          { name: r.productName, status: r.productStatus },
          readings.get(r.row.id),
        ),
      ),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({
              o: ordering,
              p: ordering === 'a' ? last.row.priority : null,
              t: last.cursorAt,
              i: last.row.id,
            })
          : null,
      timezone: merchant.timezone,
    };
  }

  /**
   * Merchant-local date range on `last_changed_at`. Default: the last 30
   * days. The active view is unbounded unless a range is given, so a current
   * stock problem that has not changed for 30 days stays visible (§5.9).
   */
  private range(
    timezone: string,
    query: ListChangesQuery,
    status: 'active' | 'resolved' | 'all',
  ): { start: Date; end: Date } | null {
    if (status === 'active' && !query.from && !query.to) return null;
    const valid = (date: string) => addDays(date, 0) === date;
    if ((query.from && !valid(query.from)) || (query.to && !valid(query.to)))
      throw new BadRequestException('Invalid date');
    const to = query.to ?? localDate(new Date(), timezone);
    const from = query.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));
    const days = daysBetween(from, to) + 1;
    if (days < 1) throw new BadRequestException('from must not be after to');
    if (days > MAX_RANGE_DAYS)
      throw new BadRequestException(
        `Date range must not exceed ${MAX_RANGE_DAYS} days`,
      );
    return {
      start: localDayStart(from, timezone),
      end: localDayStart(addDays(to, 1), timezone),
    };
  }

  async status(merchant: ChangeMerchant): Promise<ChangeStatusResponse> {
    const [identity] = await this.db
      .select({ provenance: schema.merchants.dataProvenance })
      .from(schema.merchants)
      .where(eq(schema.merchants.id, merchant.merchantId));
    const account = (identity?.provenance ??
      'ordinary') as ChangeDataProvenance;
    const settings = this.config.settings;
    const requiredDays = requiredHistoryDays(settings);
    const requirements = {
      minUsualWeeklyUnits: settings.minExpectedWeekly,
      minBaselineWeeks: settings.baselineWeeksMin,
      forecastMinUnits: settings.forecastMinUnits,
      forecastWindowDays: settings.forecastWindowDays,
    };
    const base: ChangeStatusResponse = {
      available: false,
      unavailableReason: this.config.enabled ? 'not_enabled' : 'disabled',
      timezone: merchant.timezone,
      modelVersion: MODEL_VERSION,
      cadence: { stockMinutes: 60, trendsDaily: true },
      initialized: false,
      lastSuccessfulAnalysisAt: null,
      processing: 'idle',
      pendingSince: null,
      lastFailureAt: null,
      readiness: {
        trends: 'building_baseline',
        requiredHistoryDays: requiredDays,
        daysUntilTrendsReady: null,
        ...requirements,
        products: [],
      },
      recordingGap: false,
      lastRecordedSaleDate: null,
      summary: { activeChanges: 0, productsNeedingStockReview: 0 },
      provenance: { account, includesTestPayments: false },
    };
    if (!this.enabled(merchant)) return base;

    const id = merchant.merchantId;
    const [workRows, states, runs, counts] = await Promise.all([
      this.db.execute(sql`
        SELECT w.bootstrap_status, w.last_success_at, w.last_failure_at, ${WORK_PROCESSING_SQL.columns}
        FROM merchant_change_work w ${WORK_PROCESSING_SQL.lateral}
        WHERE w.merchant_id = ${id}::uuid`),
      this.db
        .select({
          nodeKey: schema.merchantChangeStates.nodeKey,
          productId: schema.merchantChangeStates.productId,
          productName: schema.merchantProducts.name,
          value: schema.merchantChangeStates.value,
        })
        .from(schema.merchantChangeStates)
        .leftJoin(
          schema.merchantProducts,
          and(
            eq(
              schema.merchantProducts.id,
              schema.merchantChangeStates.productId,
            ),
            eq(
              schema.merchantProducts.merchantId,
              schema.merchantChangeStates.merchantId,
            ),
          ),
        )
        .where(
          and(
            eq(schema.merchantChangeStates.merchantId, id),
            or(
              and(
                eq(
                  schema.merchantChangeStates.nodeKey,
                  'merchant_recording_activity',
                ),
                isNull(schema.merchantChangeStates.productId),
              ),
              and(
                inArray(schema.merchantChangeStates.nodeKey, [
                  'unit_demand_change',
                  'adjusted_daily_demand',
                ]),
                eq(schema.merchantProducts.status, 'active'),
              ),
            ),
          ),
        ),
      this.db
        .select({ coverage: schema.merchantChangeRuns.coverage })
        .from(schema.merchantChangeRuns)
        .where(
          and(
            eq(schema.merchantChangeRuns.merchantId, id),
            eq(schema.merchantChangeRuns.status, 'succeeded'),
          ),
        )
        .orderBy(
          desc(schema.merchantChangeRuns.completedAt),
          desc(schema.merchantChangeRuns.id),
        )
        .limit(1),
      this.db.execute(sql`
        SELECT count(*)::int AS active,
          count(DISTINCT product_id) FILTER (WHERE case_type = 'stock_risk')::int AS stock
        FROM merchant_change_cases WHERE merchant_id = ${id}::uuid AND status = 'active'`),
    ]);

    const work = workRows.rows[0] as
      | (WorkProcessingRow & {
          bootstrap_status: 'pending' | 'completed';
          last_success_at: string | Date | null;
          last_failure_at: string | Date | null;
        })
      | undefined;
    const iso = (value: string | Date | null | undefined) =>
      value ? new Date(value).toISOString() : null;
    const processing = processingState(work);

    const recording = states.find(
      (s) => s.nodeKey === 'merchant_recording_activity',
    )?.value as MerchantRecordingValue | undefined;
    const demandStates = states.filter(
      (s) => s.nodeKey === 'unit_demand_change',
    );
    const demand = demandStates.map((s) => s.value as DemandChangeValue);
    const trends = this.trendReadiness(recording, demand, requiredDays);
    const forecastReasons = new Map(
      states
        .filter((s) => s.nodeKey === 'adjusted_daily_demand')
        .map((s) => [
          s.productId,
          (s.value as AdjustedDemandValue).forecastReason,
        ]),
    );
    const products = demandStates
      .map((s): ChangeProductReadiness => {
        const { assessment } = s.value as DemandChangeValue;
        const reason = forecastReasons.get(s.productId) ?? null;
        return {
          productId: s.productId!,
          productName: s.productName ?? '',
          trends: assessment.baseReadiness,
          baselineWeeksUsed: assessment.weeksUsed,
          usualWeeklyUnits: assessment.materiality?.expected ?? null,
          daysUntilTrendsReady:
            assessment.baseReadiness === 'building_baseline'
              ? assessment.daysNeeded || null
              : null,
          forecast: { available: reason === null, reason },
        };
      })
      // A merchant-wide recording gap is shown once, not as a reason per product.
      .filter(
        (p) =>
          p.trends !== 'ready' ||
          (p.forecast.reason !== null &&
            p.forecast.reason !== 'no_recent_activity'),
      )
      .sort(
        (a, b) =>
          a.productName.localeCompare(b.productName) ||
          a.productId.localeCompare(b.productId),
      );
    const count = counts.rows[0] as { active: number; stock: number };

    return {
      ...base,
      available: true,
      unavailableReason: null,
      initialized: work?.bootstrap_status === 'completed',
      lastSuccessfulAnalysisAt: iso(work?.last_success_at),
      processing,
      pendingSince: iso(work?.pending_since),
      lastFailureAt: iso(work?.last_failure_at),
      readiness: {
        ...trends,
        requiredHistoryDays: requiredDays,
        ...requirements,
        products,
      },
      recordingGap: recording?.recordingGap ?? false,
      lastRecordedSaleDate: recording?.lastSaleDate ?? null,
      summary: {
        activeChanges: count.active,
        productsNeedingStockReview: count.stock,
      },
      provenance: {
        account,
        includesTestPayments: sourceInfo(runs[0]?.coverage)
          .includesTestPayments,
      },
    };
  }

  /** Merchant-level trend readiness from the persisted product assessments. */
  private trendReadiness(
    recording: MerchantRecordingValue | undefined,
    demand: DemandChangeValue[],
    requiredDays: number,
  ): { trends: ChangeReadiness; daysUntilTrendsReady: number | null } {
    if (recording?.recordingGap)
      return { trends: 'recording_gap', daysUntilTrendsReady: null };
    const readiness = demand.map((d) => d.assessment.baseReadiness);
    if (readiness.includes('ready'))
      return { trends: 'ready', daysUntilTrendsReady: 0 };
    const building = demand.filter(
      (d) => d.assessment.baseReadiness === 'building_baseline',
    );
    if (building.length || !demand.length)
      return {
        trends: 'building_baseline',
        daysUntilTrendsReady: building.length
          ? Math.min(...building.map((d) => d.assessment.daysNeeded))
          : recording
            ? requiredDays
            : null,
      };
    return {
      trends: readiness.includes('data_quality_blocked')
        ? 'data_quality_blocked'
        : 'insufficient_history',
      daysUntilTrendsReady: null,
    };
  }

  async detail(
    merchant: ChangeMerchant,
    changeId: string,
  ): Promise<ChangeDetailResponse> {
    this.assertAvailable(merchant);
    const c = schema.merchantChangeCases;
    const t = schema.merchantChangeTransitions;
    const p = schema.merchantProducts;
    const [found] = await this.db
      .select({ row: c, productName: p.name, productStatus: p.status })
      .from(c)
      .leftJoin(p, and(eq(p.id, c.productId), eq(p.merchantId, c.merchantId)))
      .where(and(eq(c.id, changeId), eq(c.merchantId, merchant.merchantId)));
    if (!found) throw new NotFoundException();
    const row = found.row;
    const readings = await this.readings(merchant.merchantId, [row.id]);
    const change = summarize(
      row,
      { name: found.productName, status: found.productStatus },
      readings.get(row.id),
    );

    const [latest] = row.latestTransitionId
      ? await this.db
          .select()
          .from(t)
          .where(
            and(
              eq(t.id, row.latestTransitionId),
              eq(t.merchantId, merchant.merchantId),
            ),
          )
      : [];
    const [run, history, nodes] = await Promise.all([
      latest
        ? this.db
            .select()
            .from(schema.merchantChangeRuns)
            .where(
              and(
                eq(schema.merchantChangeRuns.id, latest.runId),
                eq(schema.merchantChangeRuns.merchantId, merchant.merchantId),
              ),
            )
            .then((r) => r[0])
        : undefined,
      this.db
        .select()
        .from(t)
        .where(and(eq(t.merchantId, merchant.merchantId), eq(t.caseId, row.id)))
        .orderBy(desc(t.createdAt), desc(t.id))
        .limit(HISTORY_LIMIT),
      latest?.parentTransitionIds.length
        ? this.db
            .select()
            .from(t)
            .where(
              and(
                eq(t.merchantId, merchant.merchantId),
                eq(t.runId, latest.runId),
                isNull(t.caseId),
                or(eq(t.productId, row.productId), isNull(t.productId)),
              ),
            )
        : [],
    ]);

    const evidence = (row.evidence ?? {}) as CaseEvidence;
    const facts = evidence.facts ?? { productName: null };
    const settings = row.settings;
    const asOf = run?.asOf ?? row.lastChangedAt;
    const day =
      evidence.observation?.to ?? completedLocalDay(asOf, merchant.timezone);
    const windows = windowsFor(day, settings);
    const baselineWeeks = (facts.baselineWeeks ?? []).flatMap((value, i) =>
      windows.weeks[i] ? [{ ...windows.weeks[i], value }] : [],
    );
    const unit = facts.measure === 'transactions' ? 'sales' : 'units';
    const isDemand = facts.recent !== undefined;

    return {
      change,
      runId: latest?.runId ?? null,
      whatChanged: {
        recent: isDemand
          ? {
              key: 'recent',
              label: `Recorded ${unit} in the last 7 days`,
              value: facts.recent ?? null,
              unit,
            }
          : null,
        usualWeekly:
          facts.usual !== undefined
            ? {
                key: 'usual',
                label: `Usual ${unit} per week`,
                value: facts.usual,
                unit,
              }
            : null,
        baselineWeeks,
      },
      impact: this.trail(latest?.parentTransitionIds ?? [], nodes),
      transitions: history.reverse().map((entry): ChangeTransitionEntry => {
        const explanation = (entry.explanation ?? {}) as {
          kind?: ChangeTransitionEntry['kind'];
          reason?: RunReason;
          explanation?: CaseExplanation;
        };
        return {
          id: entry.id,
          at: entry.createdAt.toISOString(),
          reason: explanation.reason ?? 'source_change',
          kind: explanation.kind ?? 'updated',
          summary: explanation.explanation?.headline ?? '',
          before: safeValues(
            (entry.beforeValue as { values?: unknown } | null)?.values,
          ),
          after: safeValues(
            (entry.afterValue as { values?: unknown } | null)?.values,
          ),
        };
      }),
      calculation: {
        asOf: asOf.toISOString(),
        timezone: merchant.timezone,
        modelVersion: row.modelVersion,
        recentWindow: safePeriod(evidence.observation),
        baselineWeeks,
        baselineWeeksUsed: facts.weeksUsed ?? null,
        forecastWindow:
          row.caseType === 'stock_risk' || facts.measure === 'units'
            ? windows.forecast
            : null,
        settings: { ...settings },
        assumptions: [
          ...(facts.weeksUsed
            ? [
                `Usual is the average of the ${facts.weeksUsed} complete weeks before the last 7 days.`,
              ]
            : []),
          'Missing records count as zero recorded units, not as proof of zero sales.',
          PROJECTION_ASSUMPTION,
          'Days are calendar days in your business timezone.',
        ],
      },
      source: sourceInfo(run?.coverage),
      actions: {
        viewProduct: change.productAvailable,
        reviewStock: change.productAvailable,
      },
    };
  }

  /** Opening and latest saved values per case, in one query over the case index. */
  private async readings(
    merchantId: string,
    caseIds: string[],
  ): Promise<Map<string, CaseReadings>> {
    if (!caseIds.length) return new Map();
    // ponytail: aggregates every entry of each case on the page; cases hold few entries.
    const result = await this.db.execute(sql`
      SELECT case_id,
        (array_agg(before_value -> 'values' ORDER BY created_at, id))[1] AS opening,
        (array_agg(after_value -> 'values' ORDER BY created_at DESC, id DESC)
          FILTER (WHERE jsonb_array_length(COALESCE(after_value -> 'values', '[]'::jsonb)) > 0))[1] AS latest
      FROM merchant_change_transitions
      WHERE merchant_id = ${merchantId}::uuid
        AND case_id IN (${sql.join(
          caseIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      GROUP BY case_id`);
    return new Map(
      (
        result.rows as Array<{
          case_id: string;
          opening: unknown;
          latest: unknown;
        }>
      ).map((r) => [r.case_id, { opening: r.opening, latest: r.latest }]),
    );
  }

  /** The saved dependency trail: parent transitions of the latest entry, walked upward within its run. */
  private trail(
    start: string[],
    nodes: Array<typeof schema.merchantChangeTransitions.$inferSelect>,
  ): ChangeTrailStep[] {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const seen = new Set<string>();
    const queue = [...start];
    while (queue.length) {
      const id = queue.shift()!;
      const node = byId.get(id);
      if (!node || seen.has(id)) continue;
      seen.add(id);
      queue.push(...node.parentTransitionIds);
    }
    return [...seen]
      .map((id) => byId.get(id)!)
      .filter((n) => NODES.has(n.nodeKey as NodeKey))
      .sort(
        (a, b) =>
          NODE_ORDER.indexOf(a.nodeKey as NodeKey) -
          NODE_ORDER.indexOf(b.nodeKey as NodeKey),
      )
      .map((n) => {
        const key = n.nodeKey as NodeKey;
        const node = NODES.get(key)!;
        const pick = (value: unknown): ChangeValue | null => {
          if (value === null || value === undefined) return null;
          const found = node
            .explain(value)
            .find((v) => v.key === TRAIL[key].value);
          return found ? safeValues([found])[0] : null;
        };
        const before = pick(n.beforeValue);
        const after = pick(n.afterValue);
        return {
          label: TRAIL[key].label,
          before,
          after,
          changed: before?.value !== after?.value,
        };
      });
  }

  async run(
    merchant: ChangeMerchant,
    runId: string,
  ): Promise<ChangeRunEvidence> {
    this.assertAvailable(merchant);
    const r = schema.merchantChangeRuns;
    const [run] = await this.db
      .select()
      .from(r)
      .where(and(eq(r.id, runId), eq(r.merchantId, merchant.merchantId)));
    if (!run) throw new NotFoundException();
    const cases =
      (run.counts as { cases?: Record<string, number> }).cases ?? {};
    return {
      id: run.id,
      reason: run.reason,
      status: run.status,
      asOf: run.asOf.toISOString(),
      completedAt: run.completedAt.toISOString(),
      modelVersion: run.modelVersion,
      timezone: merchant.timezone,
      settings: { ...run.settings },
      coverage: sourceInfo(run.coverage),
      changedCases:
        (cases.opened ?? 0) + (cases.appended ?? 0) + (cases.resolved ?? 0),
    };
  }

  // ------------------------------------------------------------ Deep Analytics (§2.5)

  private async initialized(
    merchant: MerchantIdentity,
  ): Promise<{ lastSuccessAt: Date | null } | null> {
    if (!this.config.isEnabledFor(merchant)) return null;
    const [work] = await this.db
      .select({
        bootstrapStatus: schema.merchantChangeWork.bootstrapStatus,
        lastSuccessAt: schema.merchantChangeWork.lastSuccessAt,
      })
      .from(schema.merchantChangeWork)
      .where(eq(schema.merchantChangeWork.merchantId, merchant.id));
    return work?.bootstrapStatus === 'completed'
      ? { lastSuccessAt: work.lastSuccessAt }
      : null;
  }

  /**
   * True when Change Intelligence owns product demand-change and stock-risk
   * outputs for this merchant: enabled and initialized. Otherwise legacy
   * analytics stays authoritative (rollback restores legacy reads).
   */
  async isAuthoritative(merchant: MerchantIdentity): Promise<boolean> {
    return (await this.initialized(merchant)) !== null;
  }

  /** Adapter insights from active stock-risk and unit-demand cases; null when not authoritative. */
  async deepAnalyticsInsights(
    merchant: MerchantIdentity,
  ): Promise<MerchantInsight[] | null> {
    const work = await this.initialized(merchant);
    if (!work) return null;
    const c = schema.merchantChangeCases;
    const p = schema.merchantProducts;
    const rows = await this.db
      .select({ row: c, productName: p.name, productStatus: p.status })
      .from(c)
      .leftJoin(p, and(eq(p.id, c.productId), eq(p.merchantId, c.merchantId)))
      .where(
        and(
          eq(c.merchantId, merchant.id),
          eq(c.status, 'active' satisfies ChangeCaseStatus),
          inArray(c.caseType, AUTHORITATIVE_TYPES),
        ),
      )
      .orderBy(asc(c.priority), desc(c.lastChangedAt), desc(c.id));
    return rows.map(({ row, productName, productStatus }): MerchantInsight => {
      const summary = summarize(row, {
        name: productName,
        status: productStatus,
      });
      const stock = row.caseType === 'stock_risk';
      return {
        id: row.id,
        code: `change.${row.caseType}.${row.productId}`,
        kind: stock ? 'stock_risk' : 'anomaly',
        priority: row.priority,
        title: summary.headline,
        summary: [summary.summary, summary.consequence]
          .filter(Boolean)
          .join(' '),
        recommendation: summary.suggestedAction,
        evidence: summary.after.map((value) => ({
          id: `change.${value.key}`,
          label: value.label,
          value: displayValue(value),
        })),
        limitations: [
          'Based on activity recorded in MCBuse only.',
          ...(stock || summary.consequence ? [PROJECTION_ASSUMPTION] : []),
        ],
        narrationSource: 'deterministic',
        modelVersion: row.modelVersion,
        changeCaseId: row.id,
        calculatedAt: (work.lastSuccessAt ?? row.lastChangedAt).toISOString(),
      };
    });
  }
}
