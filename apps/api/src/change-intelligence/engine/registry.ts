/**
 * Versioned dependency registry (plan §5.1–§5.2). The model version is a code
 * constant. Calculators are pure; validators are lightweight runtime schemas.
 */
import type {
  ChangeReadiness,
  ChangeValue,
  ForecastUnavailableReason,
} from '@repo/shared';
import { addDays, localDate } from './local-time';
import {
  INITIAL_LIFECYCLE,
  advanceLifecycle,
  assessMateriality,
  baselineWeeksUsed,
  classifyRisk,
  forecastStock,
  historyDaysAt,
  median,
  requiredHistoryDays,
  sum,
  type Lifecycle,
  type LifecycleEvaluation,
} from './rules';
import type {
  ActivityValue,
  Assessment,
  CalcContext,
  DemandChangeValue,
  MerchantRecordingValue,
  NodeKey,
  NodeValues,
  SourceField,
} from './types';

/**
 * Runtime copy of `CHANGE_INTELLIGENCE_MODEL_VERSION`: `@repo/shared` is
 * source-only, so a value import crashes the compiled API. registry.spec.ts
 * fails if the two differ.
 */
export const MODEL_VERSION = 'change-intelligence-v1';

// --------------------------------------------------------------- validators

type FieldKind =
  | 'number'
  | 'number?'
  | 'string'
  | 'string?'
  | 'boolean'
  | 'number[]'
  | 'object'
  | 'object?';

function shape<T>(
  spec: Record<string, FieldKind>,
): (value: unknown) => value is T {
  return (value: unknown): value is T => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false;
    const record = value as Record<string, unknown>;
    return Object.entries(spec).every(([key, kind]) => {
      const field = record[key];
      switch (kind) {
        case 'number':
          return typeof field === 'number' && Number.isFinite(field);
        case 'number?':
          return (
            field === null ||
            (typeof field === 'number' && Number.isFinite(field))
          );
        case 'string':
          return typeof field === 'string';
        case 'string?':
          return field === null || typeof field === 'string';
        case 'boolean':
          return typeof field === 'boolean';
        case 'number[]':
          return (
            Array.isArray(field) &&
            field.every((item) => typeof item === 'number')
          );
        case 'object':
          return !!field && typeof field === 'object';
        case 'object?':
          return field === null || (!!field && typeof field === 'object');
      }
    });
  };
}

type Validators = {
  [K in NodeKey]: (value: unknown) => value is NodeValues[K];
};

const activityShape = {
  day: 'string',
  historyDays: 'number',
  recent: 'number',
  recentDaily: 'number[]',
  weeks: 'number[]',
  forecastWindowTotal: 'number',
  malformedLines: 'number',
} as const;
const changeShape = {
  measure: 'string',
  day: 'string',
  assessment: 'object',
  lifecycle: 'object',
} as const;

export const VALIDATORS: Validators = {
  merchant_recording_activity: shape({
    day: 'string',
    recentUnits: 'number',
    weeks: 'number[]',
    weeksUsed: 'number',
    recordingGap: 'boolean',
    lastSaleDate: 'string?',
  }),
  product_transaction_activity: shape(activityShape),
  product_unit_activity: shape(activityShape),
  transaction_change: shape(changeShape),
  unit_demand_change: shape(changeShape),
  baseline_daily_demand: shape({
    windowUnits: 'number',
    windowDays: 'number',
    perDay: 'number',
    forecastReason: 'string?',
  }),
  adjusted_daily_demand: shape({
    perDay: 'number',
    basis: 'string',
    confirmedDirection: 'string?',
    forecastReason: 'string?',
  }),
  available_stock: shape({
    onHand: 'number',
    reserved: 'number',
    available: 'number',
  }),
  minimum_stock_policy: shape({ minimum: 'number' }),
  stock_cover: shape({
    daysToMinimum: 'number?',
    daysToZero: 'number?',
    reason: 'string?',
  }),
  projected_stock_dates: shape({
    minimumDate: 'string?',
    zeroDate: 'string?',
    reason: 'string?',
  }),
  replenishment_guidance: shape({
    suggestedUnits: 'number?',
    reason: 'string?',
  }),
  stock_risk: shape({ level: 'string', forecastReason: 'string?' }),
  merchant_change_summary: shape({
    activeChanges: 'number',
    productsNeedingStockReview: 'number',
    byType: 'object',
  }),
};

// --------------------------------------------------------------- node shape

export type NodeDefinition<K extends NodeKey> = {
  key: K;
  scope: 'merchant' | 'product';
  sources: SourceField[];
  parents: NodeKey[];
  validate: (value: unknown) => value is NodeValues[K];
  calculate: (
    ctx: CalcContext,
    previous: NodeValues[K] | null,
  ) => { value: NodeValues[K]; readiness: ChangeReadiness };
  /** Semantic projection hashed for the fingerprint (defaults to the whole value). Never timestamps. */
  semantic?: (value: NodeValues[K]) => unknown;
  /** Structured facts for transitions and explanations. */
  explain: (value: NodeValues[K]) => ChangeValue[];
};

/** Type-erased node, so heterogeneous definitions can live in one list. */
export type RegistryNode = {
  key: NodeKey;
  scope: 'merchant' | 'product';
  sources: SourceField[];
  parents: NodeKey[];
  run: (
    ctx: CalcContext,
    previous: unknown,
  ) => { value: unknown; readiness: ChangeReadiness };
  validate: (value: unknown) => boolean;
  semantic: (value: unknown) => unknown;
  explain: (value: unknown) => ChangeValue[];
};

export function defineNode<K extends NodeKey>(
  def: NodeDefinition<K>,
): RegistryNode {
  return {
    key: def.key,
    scope: def.scope,
    sources: def.sources,
    parents: def.parents,
    validate: def.validate,
    run: (ctx, previous) => {
      const result = def.calculate(
        ctx,
        def.validate(previous) ? previous : null,
      );
      if (!def.validate(result.value))
        throw new Error(`Node ${def.key} produced an invalid value`);
      return result;
    },
    semantic: (value) =>
      def.semantic && def.validate(value) ? def.semantic(value) : value,
    explain: (value) => (def.validate(value) ? def.explain(value) : []),
  };
}

// --------------------------------------------------------------- helpers

const v = (
  key: string,
  label: string,
  value: number | string | null,
  unit: ChangeValue['unit'],
  reason?: ChangeValue['reason'],
): ChangeValue =>
  reason === undefined
    ? { key, label, value, unit }
    : { key, label, value, unit, reason };

function totalIn(
  daily: Map<string, { units: number; saleIds: Set<string> }>,
  from: string,
  to: string,
  measure: 'units' | 'transactions',
) {
  let total = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const bucket = daily.get(day);
    if (bucket)
      total += measure === 'units' ? bucket.units : bucket.saleIds.size;
  }
  return total;
}

function activity(
  ctx: CalcContext,
  measure: 'units' | 'transactions',
): ActivityValue {
  const daily = ctx.daily('product');
  const { windows } = ctx;
  const recentDaily = Array.from({ length: 7 }, (_, index) =>
    totalIn(
      daily,
      addDays(windows.recent.from, index),
      addDays(windows.recent.from, index),
      measure,
    ),
  );
  const start = ctx.product?.historyStart
    ? localDate(ctx.product.historyStart, ctx.input.timezone)
    : null;
  return {
    day: windows.day,
    historyDays: historyDaysAt(start, windows.day),
    recent: sum(recentDaily),
    recentDaily,
    weeks: windows.weeks.map((week) =>
      totalIn(daily, week.from, week.to, measure),
    ),
    forecastWindowTotal: totalIn(
      daily,
      windows.forecast.from,
      windows.forecast.to,
      measure,
    ),
    malformedLines: ctx.malformedLines(),
  };
}

function assess(
  ctx: CalcContext,
  activityValue: ActivityValue,
  merchant: MerchantRecordingValue,
): Assessment {
  const { settings } = ctx;
  const weeksUsed = baselineWeeksUsed(activityValue.historyDays, settings);
  const usedWeeks = activityValue.weeks.slice(0, weeksUsed);
  const daysNeeded = Math.max(
    0,
    requiredHistoryDays(settings) - activityValue.historyDays,
  );
  const merchantMedian = median(merchant.weeks.slice(0, weeksUsed));
  const pastGap = merchant.weeks
    .slice(0, weeksUsed)
    .some((units) => units < settings.recordingGapRatio * merchantMedian);
  const materiality =
    weeksUsed > 0
      ? assessMateriality(
          {
            recent: activityValue.recent,
            weeks: usedWeeks,
            recentDaily: activityValue.recentDaily,
          },
          settings,
        )
      : null;

  let baseReadiness: ChangeReadiness = 'ready';
  if (activityValue.malformedLines > 0) baseReadiness = 'data_quality_blocked';
  else if (weeksUsed < settings.baselineWeeksMin || pastGap)
    baseReadiness = 'building_baseline';
  else if (!materiality || materiality.expected < settings.minExpectedWeekly)
    baseReadiness = 'insufficient_history';

  const readiness: ChangeReadiness =
    baseReadiness === 'data_quality_blocked'
      ? baseReadiness
      : merchant.recordingGap
        ? 'recording_gap'
        : baseReadiness;
  return {
    readiness,
    baseReadiness,
    weeksUsed,
    daysNeeded: weeksUsed < settings.baselineWeeksMin ? daysNeeded : 0,
    recent: activityValue.recent,
    usedWeeks,
    materiality,
  };
}

function demandChange(
  ctx: CalcContext,
  previous: DemandChangeValue | null,
  measure: 'units' | 'transactions',
): { value: DemandChangeValue; readiness: ChangeReadiness } {
  const activityValue = ctx.parent(
    measure === 'units'
      ? 'product_unit_activity'
      : 'product_transaction_activity',
  );
  const assessment = assess(
    ctx,
    activityValue,
    ctx.parent('merchant_recording_activity'),
  );
  let lifecycle: Lifecycle = previous?.lifecycle ?? INITIAL_LIFECYCLE;
  if (ctx.dailyEvaluation) {
    const qualifyingDirection = assessment.materiality?.qualifies
      ? assessment.materiality.direction
      : null;
    // During a recording gap only increases are assessed (§5.5 #2).
    const assessable =
      assessment.readiness === 'ready' ||
      (assessment.readiness === 'recording_gap' &&
        assessment.baseReadiness === 'ready' &&
        qualifyingDirection === 'increase');
    lifecycle = advanceLifecycleFor(ctx, lifecycle, {
      date: ctx.windows.day,
      assessable,
      qualifyingDirection: assessable ? qualifyingDirection : null,
      z:
        assessable && assessment.readiness === 'ready'
          ? (assessment.materiality?.z ?? null)
          : null,
    });
  }
  return {
    value: { measure, day: ctx.windows.day, assessment, lifecycle },
    readiness: assessment.readiness,
  };
}

/** Initialization never opens demand cases (§4.6). */
function advanceLifecycleFor(
  ctx: CalcContext,
  lifecycle: Lifecycle,
  evaluation: LifecycleEvaluation,
) {
  return advanceLifecycle(
    lifecycle,
    evaluation,
    ctx.settings,
    ctx.input.reason !== 'initialization',
  );
}

function explainActivity(label: 'units' | 'sales') {
  return (value: ActivityValue): ChangeValue[] => [
    v('recent', `Recorded ${label} in the last 7 days`, value.recent, label),
    ...value.weeks.map((week, index) =>
      v(
        `week_${index + 1}`,
        `Recorded ${label} ${index + 1} week${index ? 's' : ''} earlier`,
        week,
        label,
      ),
    ),
    v('history_days', 'Days of recorded history', value.historyDays, 'days'),
  ];
}

function explainChange(value: DemandChangeValue): ChangeValue[] {
  const unit = value.measure === 'units' ? 'units' : 'sales';
  const facts: ChangeValue[] = [
    v(
      'recent',
      `Recorded ${unit} in the last 7 days`,
      value.assessment.recent,
      unit,
    ),
    v(
      'baseline_weeks_used',
      'Earlier weeks used for usual',
      value.assessment.weeksUsed,
      'weeks',
    ),
  ];
  if (value.assessment.materiality)
    facts.push(
      v(
        'usual',
        `Usual ${unit} per week`,
        value.assessment.materiality.expected,
        unit,
      ),
    );
  if (value.assessment.daysNeeded > 0)
    facts.push(
      v(
        'days_needed',
        'More days of history needed',
        value.assessment.daysNeeded,
        'days',
      ),
    );
  return facts;
}

const FORECAST_READINESS: Record<ForecastUnavailableReason, ChangeReadiness> = {
  building_baseline: 'building_baseline',
  insufficient_units: 'insufficient_history',
  no_recent_activity: 'recording_gap',
  no_positive_demand: 'insufficient_history',
  data_quality_blocked: 'data_quality_blocked',
};
const forecastReadiness = (
  reason: ForecastUnavailableReason | null,
): ChangeReadiness => (reason ? FORECAST_READINESS[reason] : 'ready');

// --------------------------------------------------------------- nodes §5.2

export const REGISTRY_NODES: RegistryNode[] = [
  defineNode({
    key: 'merchant_recording_activity',
    scope: 'merchant',
    sources: ['sales', 'clock', 'timezone'],
    parents: [],
    validate: VALIDATORS.merchant_recording_activity,
    calculate: (ctx) => {
      const daily = ctx.daily('merchant');
      const { windows, settings } = ctx;
      const recentUnits = totalIn(
        daily,
        windows.recent.from,
        windows.recent.to,
        'units',
      );
      const weeks = windows.weeks.map((week) =>
        totalIn(daily, week.from, week.to, 'units'),
      );
      const weeksUsed = baselineWeeksUsed(
        historyDaysAt(ctx.merchantHistoryStart, windows.day),
        settings,
      );
      const usual = weeksUsed
        ? sum(weeks.slice(0, weeksUsed)) / weeksUsed
        : null;
      const recordingGap =
        recentUnits === 0 ||
        (usual !== null && recentUnits < settings.recordingGapRatio * usual);
      const lastSaleDate =
        [...daily.keys()]
          .filter((day) => day <= windows.day)
          .sort()
          .pop() ?? null;
      return {
        value: {
          day: windows.day,
          recentUnits,
          weeks,
          weeksUsed,
          recordingGap,
          lastSaleDate,
        },
        readiness: recordingGap ? 'recording_gap' : 'ready',
      };
    },
    explain: (value) => [
      v(
        'recent_units',
        'Units recorded across all products in the last 7 days',
        value.recentUnits,
        'units',
      ),
      v(
        'last_sale_date',
        'Last recorded sale',
        value.lastSaleDate,
        'local_date',
      ),
    ],
  }),
  defineNode({
    key: 'product_transaction_activity',
    scope: 'product',
    sources: ['sales', 'clock', 'timezone'],
    parents: [],
    validate: VALIDATORS.product_transaction_activity,
    calculate: (ctx) => {
      const value = activity(ctx, 'transactions');
      return {
        value,
        readiness: value.malformedLines ? 'data_quality_blocked' : 'ready',
      };
    },
    explain: explainActivity('sales'),
  }),
  defineNode({
    key: 'product_unit_activity',
    scope: 'product',
    sources: ['sales', 'clock', 'timezone'],
    parents: [],
    validate: VALIDATORS.product_unit_activity,
    calculate: (ctx) => {
      const value = activity(ctx, 'units');
      return {
        value,
        readiness: value.malformedLines ? 'data_quality_blocked' : 'ready',
      };
    },
    explain: explainActivity('units'),
  }),
  defineNode({
    key: 'transaction_change',
    scope: 'product',
    sources: [],
    parents: ['product_transaction_activity', 'merchant_recording_activity'],
    validate: VALIDATORS.transaction_change,
    calculate: (ctx, previous) => demandChange(ctx, previous, 'transactions'),
    explain: explainChange,
  }),
  defineNode({
    key: 'unit_demand_change',
    scope: 'product',
    sources: [],
    parents: ['product_unit_activity', 'merchant_recording_activity'],
    validate: VALIDATORS.unit_demand_change,
    calculate: (ctx, previous) => demandChange(ctx, previous, 'units'),
    explain: explainChange,
  }),
  defineNode({
    key: 'baseline_daily_demand',
    scope: 'product',
    sources: [],
    parents: ['product_unit_activity', 'merchant_recording_activity'],
    validate: VALIDATORS.baseline_daily_demand,
    calculate: (ctx) => {
      const unitActivity = ctx.parent('product_unit_activity');
      const merchant = ctx.parent('merchant_recording_activity');
      const { settings } = ctx;
      const windowDays = settings.forecastWindowDays;
      const forecastReason = unitActivity.malformedLines
        ? 'data_quality_blocked'
        : merchant.recordingGap
          ? 'no_recent_activity'
          : unitActivity.historyDays < windowDays
            ? 'building_baseline'
            : unitActivity.forecastWindowTotal < settings.forecastMinUnits
              ? 'insufficient_units'
              : null;
      return {
        value: {
          windowUnits: unitActivity.forecastWindowTotal,
          windowDays,
          perDay: unitActivity.forecastWindowTotal / windowDays,
          forecastReason,
        },
        readiness: forecastReadiness(forecastReason),
      };
    },
    explain: (value) => [
      v(
        'window_units',
        `Units recorded in the last ${value.windowDays} days`,
        value.windowUnits,
        'units',
      ),
      v(
        'per_day',
        'Usual units per day',
        value.perDay,
        'units_per_day',
        value.forecastReason,
      ),
    ],
  }),
  defineNode({
    key: 'adjusted_daily_demand',
    scope: 'product',
    sources: [],
    parents: ['baseline_daily_demand', 'unit_demand_change'],
    validate: VALIDATORS.adjusted_daily_demand,
    calculate: (ctx) => {
      const baseline = ctx.parent('baseline_daily_demand');
      const change = ctx.parent('unit_demand_change');
      const confirmed = change.lifecycle.active?.direction ?? null;
      // A confirmed change uses the recent rate instead of the 28-day rate, never both (§5.8).
      const perDay = confirmed ? change.assessment.recent / 7 : baseline.perDay;
      const forecastReason =
        baseline.forecastReason ?? (perDay > 0 ? null : 'no_positive_demand');
      return {
        value: {
          perDay,
          basis: confirmed ? 'recent_7_days' : 'forecast_window',
          confirmedDirection: confirmed,
          forecastReason,
        },
        readiness: forecastReadiness(forecastReason),
      };
    },
    explain: (value) => [
      v(
        'per_day',
        'Units per day used for projections',
        value.perDay,
        'units_per_day',
        value.forecastReason,
      ),
    ],
  }),
  defineNode({
    key: 'available_stock',
    scope: 'product',
    sources: ['on_hand', 'reserved'],
    parents: [],
    validate: VALIDATORS.available_stock,
    calculate: (ctx) => {
      const onHand = ctx.product?.onHand ?? 0;
      const reserved = ctx.product?.reserved ?? 0;
      const available = onHand - reserved;
      return {
        value: { onHand, reserved, available },
        readiness: available < 0 ? 'data_quality_blocked' : 'ready',
      };
    },
    explain: (value) => [
      v('on_hand', 'On hand', value.onHand, 'units'),
      v('reserved', 'Reserved', value.reserved, 'units'),
      v('available', 'Available', value.available, 'units'),
    ],
  }),
  defineNode({
    key: 'minimum_stock_policy',
    scope: 'product',
    sources: ['threshold'],
    parents: [],
    validate: VALIDATORS.minimum_stock_policy,
    calculate: (ctx) => ({
      value: { minimum: ctx.product?.threshold ?? 0 },
      readiness: 'ready',
    }),
    explain: (value) => [v('minimum', 'Minimum stock', value.minimum, 'units')],
  }),
  defineNode({
    key: 'stock_cover',
    scope: 'product',
    sources: [],
    parents: [
      'available_stock',
      'minimum_stock_policy',
      'adjusted_daily_demand',
    ],
    validate: VALIDATORS.stock_cover,
    calculate: (ctx) => {
      const { available } = ctx.parent('available_stock');
      const { minimum } = ctx.parent('minimum_stock_policy');
      const demand = ctx.parent('adjusted_daily_demand');
      const forecast = forecastStock(
        { available, minimum, dailyUnits: demand.perDay },
        ctx.settings,
      );
      const reason =
        available < 0
          ? 'data_quality_blocked'
          : (demand.forecastReason ?? forecast.reason);
      const ready = reason === null;
      return {
        value: {
          daysToMinimum: ready ? forecast.daysToMinimum : null,
          daysToZero: ready ? forecast.daysToZero : null,
          reason,
        },
        readiness: forecastReadiness(reason),
      };
    },
    explain: (value) => [
      v(
        'days_to_minimum',
        'Days until minimum stock',
        value.daysToMinimum,
        'days',
        value.reason,
      ),
      v(
        'days_to_zero',
        'Days until out of stock',
        value.daysToZero,
        'days',
        value.reason,
      ),
    ],
  }),
  defineNode({
    key: 'projected_stock_dates',
    scope: 'product',
    sources: ['clock', 'timezone'],
    parents: ['stock_cover'],
    validate: VALIDATORS.projected_stock_dates,
    calculate: (ctx) => {
      const cover = ctx.parent('stock_cover');
      const at = (days: number | null) =>
        days === null
          ? null
          : localDate(
              new Date(ctx.input.asOf.getTime() + days * 86_400_000),
              ctx.input.timezone,
            );
      return {
        value: {
          minimumDate: at(cover.daysToMinimum),
          zeroDate: at(cover.daysToZero),
          reason: cover.reason,
        },
        readiness: forecastReadiness(cover.reason),
      };
    },
    explain: (value) => [
      v(
        'minimum_date',
        'Expected to reach minimum stock',
        value.minimumDate,
        'local_date',
        value.reason,
      ),
      v(
        'zero_date',
        'Expected to run out',
        value.zeroDate,
        'local_date',
        value.reason,
      ),
    ],
  }),
  defineNode({
    key: 'replenishment_guidance',
    scope: 'product',
    sources: [],
    parents: [
      'available_stock',
      'minimum_stock_policy',
      'adjusted_daily_demand',
    ],
    validate: VALIDATORS.replenishment_guidance,
    calculate: (ctx) => {
      const { available } = ctx.parent('available_stock');
      const { minimum } = ctx.parent('minimum_stock_policy');
      const demand = ctx.parent('adjusted_daily_demand');
      const forecast = forecastStock(
        { available, minimum, dailyUnits: demand.perDay },
        ctx.settings,
      );
      const reason =
        available < 0
          ? 'data_quality_blocked'
          : (demand.forecastReason ?? forecast.reason);
      return {
        value: {
          suggestedUnits: reason ? null : forecast.suggestedUnits,
          reason,
        },
        readiness: forecastReadiness(reason),
      };
    },
    explain: (value) => [
      v(
        'suggested_units',
        'Suggested quantity for the coming week',
        value.suggestedUnits,
        'units',
        value.reason,
      ),
    ],
  }),
  defineNode({
    key: 'stock_risk',
    scope: 'product',
    sources: [],
    parents: ['available_stock', 'minimum_stock_policy', 'stock_cover'],
    validate: VALIDATORS.stock_risk,
    calculate: (ctx) => {
      const { available } = ctx.parent('available_stock');
      const { minimum } = ctx.parent('minimum_stock_policy');
      const cover = ctx.parent('stock_cover');
      const level = classifyRisk(
        {
          available,
          minimum,
          forecastReason: cover.reason,
          daysToMinimum: cover.daysToMinimum,
        },
        ctx.settings,
      );
      return {
        value: { level, forecastReason: cover.reason },
        readiness: available < 0 ? 'data_quality_blocked' : 'ready',
      };
    },
    explain: (value) => [
      v('risk', 'Stock risk', value.level, 'risk', value.forecastReason),
    ],
  }),
  defineNode({
    key: 'merchant_change_summary',
    scope: 'merchant',
    sources: ['cases'],
    parents: [],
    validate: VALIDATORS.merchant_change_summary,
    calculate: (ctx) => {
      const cases = ctx.activeCases();
      const byType: NodeValues['merchant_change_summary']['byType'] = {};
      for (const item of cases)
        byType[item.type] = (byType[item.type] ?? 0) + 1;
      const stockProducts = new Set(
        cases
          .filter((item) => item.type === 'stock_risk')
          .map((item) => item.productId),
      );
      return {
        value: {
          activeChanges: cases.length,
          productsNeedingStockReview: stockProducts.size,
          byType,
        },
        readiness: 'ready',
      };
    },
    explain: (value) => [
      v('active_changes', 'Active changes', value.activeChanges, 'units'),
      v(
        'products_needing_stock_review',
        'Products needing stock review',
        value.productsNeedingStockReview,
        'units',
      ),
    ],
  }),
];

// --------------------------------------------------------------- validation

export type RegistryValidation = { order: NodeKey[] };

/**
 * Detects duplicate keys, missing dependencies, scope mismatches (a merchant
 * node cannot read a product node), `cases` nodes used as parents, and
 * cycles. Returns a deterministic topological order (ties keep declaration
 * order). Throws a descriptive error otherwise. Call at startup.
 */
export function validateRegistry(
  nodes: RegistryNode[] = REGISTRY_NODES,
): RegistryValidation {
  const byKey = new Map<NodeKey, RegistryNode>();
  for (const node of nodes) {
    if (byKey.has(node.key))
      throw new Error(`Registry: duplicate node key "${node.key}"`);
    byKey.set(node.key, node);
  }
  for (const node of nodes) {
    for (const parent of node.parents) {
      const parentNode = byKey.get(parent);
      if (!parentNode)
        throw new Error(
          `Registry: node "${node.key}" depends on missing node "${parent}"`,
        );
      if (node.scope === 'merchant' && parentNode.scope === 'product') {
        throw new Error(
          `Registry: merchant node "${node.key}" cannot depend on product node "${parent}"`,
        );
      }
      if (parentNode.sources.includes('cases')) {
        throw new Error(
          `Registry: node "${node.key}" cannot depend on case-derived node "${parent}"`,
        );
      }
    }
  }
  const order: NodeKey[] = [];
  const placed = new Set<NodeKey>();
  while (order.length < nodes.length) {
    const next = nodes.find(
      (node) =>
        !placed.has(node.key) &&
        node.parents.every((parent) => placed.has(parent)),
    );
    if (!next) {
      const remaining = nodes
        .filter((node) => !placed.has(node.key))
        .map((node) => node.key);
      throw new Error(
        `Registry: dependency cycle among ${remaining.join(', ')}`,
      );
    }
    placed.add(next.key);
    order.push(next.key);
  }
  return { order };
}

export function instanceKey(
  nodeKey: NodeKey,
  productId: string | null,
): string {
  return productId ? `${nodeKey}:${productId}` : nodeKey;
}
