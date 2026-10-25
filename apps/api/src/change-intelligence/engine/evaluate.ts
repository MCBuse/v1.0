/**
 * Evaluation entrypoint (plan §5.3, §6). Pure: no I/O, clock and settings injected.
 *
 * Selective propagation: only directly affected instances are seeded; a node
 * runs when seeded, missing, or when a parent's fingerprint changed in this
 * run. Unchanged fingerprints stop propagation.
 */
import type {
  CaseResolution,
  ChangeCaseType,
  ChangeSeverity,
  ChangeValue,
  StockRiskLevel,
} from '@repo/shared';
import { sha256Hex } from './canonical';
import { explainCase } from './explanations';
import { completedLocalDay, daysBetween, localDate } from './local-time';
import {
  MODEL_VERSION,
  REGISTRY_NODES,
  VALIDATORS,
  instanceKey,
  validateRegistry,
  type RegistryNode,
} from './registry';
import { baselineWeeksUsed, mean, windowsFor, type Direction } from './rules';
import { settingsFingerprint, validateSettings } from './settings';
import type {
  ActiveCase,
  CalcContext,
  CaseFacts,
  CaseOperation,
  DailyBucket,
  EvaluationInput,
  EvaluationResult,
  NodeKey,
  NodeState,
  NodeStateRecord,
  NodeValues,
  ProductField,
  ProductObservation,
  StateTransition,
} from './types';

const RISK_SEVERITY: Partial<Record<StockRiskLevel, ChangeSeverity>> = {
  out_of_stock: 'high',
  low_stock: 'medium',
  projected_stock_risk: 'low',
};
const DEMAND_TYPES = {
  units: {
    increase: 'unit_demand_increase',
    decrease: 'unit_demand_decrease',
    node: 'unit_demand_change',
  },
  transactions: {
    increase: 'transaction_velocity_increase',
    decrease: 'transaction_velocity_decrease',
    node: 'transaction_change',
  },
} as const;

export function evaluateMerchant(
  input: EvaluationInput,
  nodes: RegistryNode[] = REGISTRY_NODES,
): EvaluationResult {
  const { order } = validateRegistry(nodes);
  const settings = validateSettings({ ...input.settings });
  const fingerprintOfSettings = settingsFingerprint(settings);
  const tz = input.timezone;
  const day = completedLocalDay(input.asOf, tz);
  const windows = windowsFor(day, settings);
  const dailyEvaluation =
    input.lastDailyEvaluationDate === null ||
    day > input.lastDailyEvaluationDate;
  const nodeByKey = new Map(nodes.map((node) => [node.key, node]));
  const products = [...input.products].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const activeProducts = products.filter(
    (product) => product.status === 'active',
  );

  // ---- index observations once
  const merchantDaily = new Map<string, DailyBucket>();
  const productDaily = new Map<string, Map<string, DailyBucket>>();
  const malformed = new Map<string, number>();
  let earliestSale: string | null = null;
  for (const line of input.sales) {
    const date = localDate(line.occurredAt, tz);
    if (line.exclusionReason === 'malformed') {
      if (line.productId && date >= windows.earliest && date <= day) {
        malformed.set(line.productId, (malformed.get(line.productId) ?? 0) + 1);
      }
      continue;
    }
    if (!line.eligible) continue;
    if (earliestSale === null || date < earliestSale) earliestSale = date;
    add(merchantDaily, date, line.saleId, line.quantity);
    if (line.productId) {
      const map =
        productDaily.get(line.productId) ?? new Map<string, DailyBucket>();
      productDaily.set(line.productId, map);
      add(map, date, line.saleId, line.quantity);
    }
  }
  const historyStarts = products.flatMap((product) =>
    product.historyStart ? [localDate(product.historyStart, tz)] : [],
  );
  if (earliestSale) historyStarts.push(earliestSale);
  const merchantHistoryStart = historyStarts.length
    ? historyStarts.sort()[0]
    : null;

  // ---- seeds
  const seeded = new Set<string>();
  const seedAll = (
    predicate: (node: RegistryNode) => boolean,
    productIds: Array<string | null> | null,
  ) => {
    for (const node of nodes) {
      if (!predicate(node)) continue;
      if (node.scope === 'merchant') seeded.add(instanceKey(node.key, null));
      else
        for (const id of productIds ?? activeProducts.map((p) => p.id))
          if (id) seeded.add(instanceKey(node.key, id));
    }
  };
  const affected = input.affected;
  const everything =
    affected === 'all'
      ? input.reason !== 'clock'
      : affected.merchant.includes('timezone');
  if (everything) seedAll(() => true, null);
  if (dailyEvaluation) seedAll((node) => node.sources.includes('clock'), null);
  const productFields = (id: string): ProductField[] =>
    affected === 'all' ? [] : (affected.products[id] ?? []);
  if (affected !== 'all') {
    if (affected.merchant.includes('sales'))
      seedAll(
        (node) => node.scope === 'merchant' && node.sources.includes('sales'),
        [],
      );
    for (const [productId, fields] of Object.entries(affected.products)) {
      for (const field of fields) {
        if (field === 'status')
          seedAll((node) => node.scope === 'product', [productId]);
        else {
          seedAll(
            (node) => node.scope === 'product' && node.sources.includes(field),
            [productId],
          );
          if (field === 'sales')
            seedAll(
              (node) =>
                node.scope === 'merchant' && node.sources.includes('sales'),
              [],
            );
        }
      }
    }
  }

  // ---- propagation
  const current: Record<string, NodeState> = { ...input.previousStates };
  const changed = new Set<string>();
  const states: NodeStateRecord[] = [];
  const transitions: StateTransition[] = [];
  const invoked: string[] = [];
  const counts = { evaluated: 0, changed: 0, skipped: 0, blocked: 0 };
  let activeCasesAfter: ActiveCase[] = input.previousActiveCases;

  const parentKey = (key: NodeKey, productId: string | null) =>
    instanceKey(
      key,
      nodeByKey.get(key)?.scope === 'merchant' ? null : productId,
    );

  const readState = <K extends NodeKey>(
    source: Record<string, NodeState>,
    key: K,
    productId: string | null,
  ): NodeValues[K] | null => {
    const state = source[parentKey(key, productId)];
    const guard = VALIDATORS[key];
    return state && guard(state.value) ? state.value : null;
  };

  const context = (product: ProductObservation | null): CalcContext => ({
    input,
    settings,
    windows,
    dailyEvaluation,
    product,
    merchantHistoryStart,
    parent: <K extends NodeKey>(key: K): NodeValues[K] => {
      const value = readState(current, key, product?.id ?? null);
      if (value === null)
        throw new Error(
          `Missing or invalid parent state ${parentKey(key, product?.id ?? null)}`,
        );
      return value;
    },
    daily: (scope) =>
      scope === 'merchant'
        ? merchantDaily
        : (productDaily.get(product?.id ?? '') ?? new Map()),
    malformedLines: () => (product ? (malformed.get(product.id) ?? 0) : 0),
    activeCases: () => activeCasesAfter,
  });

  const evaluateNode = (
    node: RegistryNode,
    product: ProductObservation | null,
    force: boolean,
  ) => {
    const productId = product?.id ?? null;
    const key = instanceKey(node.key, productId);
    const previous = current[key];
    const previousValid = !!previous && node.validate(previous.value);
    const dirty =
      force ||
      seeded.has(key) ||
      !previousValid ||
      node.parents.some((parent) => changed.has(parentKey(parent, productId)));
    if (!dirty) {
      counts.skipped += 1;
      return;
    }
    const result = node.run(context(product), previous?.value);
    invoked.push(key);
    counts.evaluated += 1;
    if (result.readiness === 'data_quality_blocked') counts.blocked += 1;
    const fingerprint = sha256Hex({
      readiness: result.readiness,
      value: node.semantic(result.value),
    });
    if (previousValid && previous.fingerprint === fingerprint) return;
    const after: NodeState = {
      value: result.value,
      readiness: result.readiness,
      fingerprint,
      version: (previous?.version ?? 0) + 1,
    };
    current[key] = after;
    changed.add(key);
    counts.changed += 1;
    states.push({ ...after, instanceKey: key, nodeKey: node.key, productId });
    transitions.push({
      instanceKey: key,
      nodeKey: node.key,
      productId,
      before: previous ?? null,
      after,
      parents: node.parents.map((parent) => {
        const parentInstance = parentKey(parent, productId);
        const state = current[parentInstance];
        return {
          instanceKey: parentInstance,
          version: state?.version ?? 0,
          fingerprint: state?.fingerprint ?? '',
        };
      }),
      explanation: node.explain(result.value),
    });
  };

  const caseNodes = (node: RegistryNode) => node.sources.includes('cases');
  for (const key of order) {
    const node = nodeByKey.get(key);
    if (!node || caseNodes(node)) continue;
    if (node.scope === 'merchant') evaluateNode(node, null, false);
    else
      for (const product of activeProducts) evaluateNode(node, product, false);
  }

  // ---- case operations
  const operations = deriveCaseOperations({
    input,
    day,
    dailyEvaluation,
    products,
    changed,
    previous: <K extends NodeKey>(key: K, productId: string) =>
      readState(input.previousStates, key, productId),
    next: <K extends NodeKey>(key: K, productId: string) =>
      readState(current, key, productId),
    fields: productFields,
    observation: windows.recent,
    settingsFingerprint: fingerprintOfSettings,
  });
  activeCasesAfter = applyOperations(
    input.previousActiveCases,
    operations,
    day,
  );

  for (const key of order) {
    const node = nodeByKey.get(key);
    if (!node || !caseNodes(node)) continue;
    const force = operations.length > 0;
    if (node.scope === 'merchant') evaluateNode(node, null, force);
    else
      for (const product of activeProducts) evaluateNode(node, product, force);
  }

  return {
    modelVersion: MODEL_VERSION,
    merchantId: input.merchantId,
    reason: input.reason,
    asOf: input.asOf,
    timezone: tz,
    localDate: day,
    settings,
    settingsFingerprint: fingerprintOfSettings,
    dailyEvaluationDate: dailyEvaluation ? day : null,
    states,
    transitions,
    caseOperations: operations,
    counts,
    invoked,
  };
}

function add(
  map: Map<string, DailyBucket>,
  date: string,
  saleId: string,
  quantity: number,
) {
  const bucket = map.get(date) ?? { units: 0, saleIds: new Set<string>() };
  bucket.units += quantity;
  bucket.saleIds.add(saleId);
  map.set(date, bucket);
}

/**
 * Applies operations to the active case list. Newly opened cases get a
 * provisional id (`new:<productId>:<type>`); the persistence layer assigns real ids.
 */
export function applyOperations(
  active: ActiveCase[],
  operations: CaseOperation[],
  day: string,
): ActiveCase[] {
  let next = [...active];
  for (const op of operations) {
    if (op.op === 'resolve')
      next = next.filter((item) => item.id !== op.caseId);
    else if (op.op === 'append') {
      next = next.map((item) =>
        item.id === op.caseId
          ? { ...item, severity: op.severity, lastChangeDate: day }
          : item,
      );
    } else {
      next.push({
        id: `new:${op.productId}:${op.type}`,
        productId: op.productId,
        type: op.type,
        severity: op.severity,
        lastChangeDate: day,
      });
    }
  }
  return next;
}

// ------------------------------------------------------------------ cases §6

type DeriveInput = {
  input: EvaluationInput;
  day: string;
  dailyEvaluation: boolean;
  products: ProductObservation[];
  changed: Set<string>;
  previous: <K extends NodeKey>(
    key: K,
    productId: string,
  ) => NodeValues[K] | null;
  next: <K extends NodeKey>(key: K, productId: string) => NodeValues[K] | null;
  fields: (productId: string) => ProductField[];
  observation: { from: string; to: string };
  settingsFingerprint: string;
};

function deriveCaseOperations(d: DeriveInput): CaseOperation[] {
  const { input, day, changed, previous, next } = d;
  const ops: CaseOperation[] = [];
  const active = new Map(
    input.previousActiveCases.map((item) => [
      `${item.productId}|${item.type}`,
      item,
    ]),
  );
  const touched = new Set<string>();
  const productIds = new Set(d.products.map((product) => product.id));

  const base = (
    product: ProductObservation | null,
    type: ChangeCaseType,
    severity: ChangeSeverity,
    facts: CaseFacts,
    kind: 'open' | 'append' | 'resolve',
    refs: string[],
    before: ChangeValue[] = [],
    after: ChangeValue[] = [],
  ) => ({
    productId: product?.id ?? null,
    type,
    severity,
    facts,
    explanation: explainCase(type, facts, kind),
    before,
    after,
    observation:
      type === 'stock_risk' || type === 'stock_threshold_change'
        ? null
        : d.observation,
    transitionRefs: refs.filter((ref) => changed.has(ref)),
    settingsFingerprint: d.settingsFingerprint,
  });
  const open = (
    product: ProductObservation,
    type: ChangeCaseType,
    severity: ChangeSeverity,
    facts: CaseFacts,
    refs: string[],
    before?: ChangeValue[],
    after?: ChangeValue[],
  ) => {
    ops.push({
      op: 'open',
      ...base(product, type, severity, facts, 'open', refs, before, after),
      identifiedDuringInitialAnalysis: input.reason === 'initialization',
    });
  };
  const append = (
    existing: ActiveCase,
    product: ProductObservation,
    severity: ChangeSeverity,
    facts: CaseFacts,
    refs: string[],
    before?: ChangeValue[],
    after?: ChangeValue[],
  ) => {
    touched.add(existing.id);
    ops.push({
      op: 'append',
      caseId: existing.id,
      ...base(
        product,
        existing.type,
        severity,
        facts,
        'append',
        refs,
        before,
        after,
      ),
      notRecheckedSince: facts.notRecheckedSince ?? null,
    });
  };
  const resolve = (
    existing: ActiveCase,
    product: ProductObservation | null,
    resolution: CaseResolution,
    facts: CaseFacts,
    refs: string[] = [],
  ) => {
    touched.add(existing.id);
    ops.push({
      op: 'resolve',
      caseId: existing.id,
      ...base(
        product,
        existing.type,
        existing.severity,
        { ...facts, resolution },
        'resolve',
        refs,
      ),
      resolution,
    });
  };

  for (const product of d.products) {
    const pid = product.id;
    const name = { productName: product.name };
    if (product.status === 'archived') {
      for (const item of input.previousActiveCases)
        if (item.productId === pid)
          resolve(item, product, 'product_archived', name);
      continue;
    }
    const coverBefore = previous('stock_cover', pid)?.daysToMinimum ?? null;
    const coverAfter = next('stock_cover', pid)?.daysToMinimum ?? null;
    const coverRef = instanceKey('stock_cover', pid);

    // Demand cases follow the change node's lifecycle.
    for (const measure of ['units', 'transactions'] as const) {
      const types = DEMAND_TYPES[measure];
      const ref = instanceKey(types.node, pid);
      if (!changed.has(ref)) continue;
      const after = next(types.node, pid);
      if (!after) continue;
      const before = previous(types.node, pid);
      const existing =
        active.get(`${pid}|${types.increase}`) ??
        active.get(`${pid}|${types.decrease}`);
      const direction = after.lifecycle.active?.direction ?? null;
      const typeFor = (dir: Direction): ChangeCaseType => types[dir];
      const m = after.assessment.materiality;
      const facts: CaseFacts = {
        ...name,
        measure,
        direction: direction ?? undefined,
        recent: after.assessment.recent,
        usual: m?.expected,
        weeksUsed: after.assessment.weeksUsed,
        baselineWeeks: after.assessment.usedWeeks,
        daysToMinimumBefore: measure === 'units' ? coverBefore : undefined,
        daysToMinimumAfter: measure === 'units' ? coverAfter : undefined,
        notRecheckedSince: after.lifecycle.notRecheckedSince,
        evidence: {
          z: m?.z ?? null,
          variance: m?.variance ?? null,
          spikeAdjustedRecent: m?.spikeAdjustedRecent ?? null,
        },
      };
      const unit = measure === 'units' ? 'units' : 'sales';
      const beforeValues: ChangeValue[] = [
        {
          key: 'usual',
          label: `Usual ${unit} per week`,
          value: m?.expected ?? null,
          unit,
        },
      ];
      const afterValues: ChangeValue[] = [
        {
          key: 'recent',
          label: `${unit === 'units' ? 'Units' : 'Sales'} in the last 7 days`,
          value: after.assessment.recent,
          unit,
        },
      ];
      if (measure === 'units') {
        beforeValues.push({
          key: 'days_to_minimum',
          label: 'Days until minimum stock',
          value: coverBefore,
          unit: 'days',
        });
        afterValues.push({
          key: 'days_to_minimum',
          label: 'Days until minimum stock',
          value: coverAfter,
          unit: 'days',
        });
      }
      const refs = [ref, coverRef];
      const severity: ChangeSeverity = measure === 'units' ? 'medium' : 'low';
      if (existing) {
        const existingDirection: Direction =
          existing.type === types.increase ? 'increase' : 'decrease';
        if (!direction)
          resolve(
            existing,
            product,
            after.lifecycle.lastResolution ?? 'no_longer_detected',
            facts,
            refs,
          );
        else if (direction !== existingDirection) {
          resolve(existing, product, 'direction_reversed', facts, refs);
          open(
            product,
            typeFor(direction),
            severity,
            facts,
            refs,
            beforeValues,
            afterValues,
          );
        } else if (
          before &&
          (before.assessment.recent !== after.assessment.recent ||
            before.assessment.materiality?.expected !== m?.expected ||
            before.lifecycle.notRecheckedSince !==
              after.lifecycle.notRecheckedSince)
        ) {
          append(
            existing,
            product,
            severity,
            facts,
            refs,
            beforeValues,
            afterValues,
          );
        }
      } else if (direction) {
        open(
          product,
          typeFor(direction),
          severity,
          facts,
          refs,
          beforeValues,
          afterValues,
        );
      }
    }

    // Stock risk.
    const riskRef = instanceKey('stock_risk', pid);
    const risk = next('stock_risk', pid);
    if (changed.has(riskRef) && risk) {
      const previousLevel = previous('stock_risk', pid)?.level ?? null;
      const existing = active.get(`${pid}|stock_risk`);
      const stock = next('available_stock', pid);
      const minimum = next('minimum_stock_policy', pid);
      const facts: CaseFacts = {
        ...name,
        riskLevel: risk.level,
        previousRiskLevel: previousLevel,
        available: stock?.available,
        minimum: minimum?.minimum,
        daysToMinimumBefore: coverBefore,
        daysToMinimumAfter: coverAfter,
        suggestedUnits:
          next('replenishment_guidance', pid)?.suggestedUnits ?? null,
        forecastReason: risk.forecastReason,
      };
      const values = (level: StockRiskLevel | null): ChangeValue[] => [
        { key: 'risk', label: 'Stock risk', value: level, unit: 'risk' },
      ];
      const refs = [
        riskRef,
        coverRef,
        instanceKey('available_stock', pid),
        instanceKey('minimum_stock_policy', pid),
      ];
      const severity = RISK_SEVERITY[risk.level];
      if (severity) {
        if (!existing)
          open(
            product,
            'stock_risk',
            severity,
            facts,
            refs,
            values(previousLevel),
            values(risk.level),
          );
        else if (previousLevel !== risk.level)
          append(
            existing,
            product,
            severity,
            facts,
            refs,
            values(previousLevel),
            values(risk.level),
          );
      } else if (existing && risk.level === 'normal') {
        resolve(existing, product, 'stock_normal', facts, refs);
      }
    }

    // Threshold change (interpretation: opens/appends on a changed low_stock_threshold).
    const minimumRef = instanceKey('minimum_stock_policy', pid);
    const previousMinimum = previous('minimum_stock_policy', pid);
    const minimum = next('minimum_stock_policy', pid);
    if (
      input.reason !== 'initialization' &&
      d.fields(pid).includes('threshold') &&
      changed.has(minimumRef) &&
      previousMinimum &&
      minimum
    ) {
      const facts: CaseFacts = {
        ...name,
        previousMinimum: previousMinimum.minimum,
        minimum: minimum.minimum,
        riskLevel: risk?.level,
        daysToMinimumBefore: coverBefore,
        daysToMinimumAfter: coverAfter,
      };
      const before: ChangeValue[] = [
        {
          key: 'minimum',
          label: 'Minimum stock',
          value: previousMinimum.minimum,
          unit: 'units',
        },
      ];
      const after: ChangeValue[] = [
        {
          key: 'minimum',
          label: 'Minimum stock',
          value: minimum.minimum,
          unit: 'units',
        },
      ];
      const existing = active.get(`${pid}|stock_threshold_change`);
      const refs = [minimumRef, coverRef, riskRef];
      if (existing)
        append(existing, product, 'low', facts, refs, before, after);
      else
        open(
          product,
          'stock_threshold_change',
          'low',
          facts,
          refs,
          before,
          after,
        );
    }

    // Historical correction: a source change altered an already-evaluated completed-day window.
    if (input.reason === 'source_change' && d.fields(pid).includes('sales')) {
      const unitRef = instanceKey('product_unit_activity', pid);
      const txRef = instanceKey('product_transaction_activity', pid);
      const beforeUnits = previous('product_unit_activity', pid);
      const afterUnits = next('product_unit_activity', pid);
      const beforeTx = previous('product_transaction_activity', pid);
      const sameWindow =
        !!beforeUnits && !!afterUnits && beforeUnits.day === afterUnits.day;
      const unitsChanged = sameWindow && changed.has(unitRef);
      const txChanged =
        !!beforeTx && beforeTx.day === day && changed.has(txRef);
      if (beforeUnits && afterUnits && (unitsChanged || txChanged)) {
        const weeks = baselineWeeksUsed(afterUnits.historyDays, input.settings);
        const usual = (value: NodeValues['product_unit_activity']) =>
          mean(value.weeks.slice(0, Math.max(weeks, 1)));
        const facts: CaseFacts = {
          ...name,
          correction: {
            measure: 'units',
            recentBefore: beforeUnits.recent,
            recentAfter: afterUnits.recent,
            usualBefore: usual(beforeUnits),
            usualAfter: usual(afterUnits),
          },
        };
        const before: ChangeValue[] = [
          {
            key: 'recent',
            label: 'Units in the last 7 days',
            value: beforeUnits.recent,
            unit: 'units',
          },
        ];
        const after: ChangeValue[] = [
          {
            key: 'recent',
            label: 'Units in the last 7 days',
            value: afterUnits.recent,
            unit: 'units',
          },
        ];
        const existing = active.get(`${pid}|historical_correction`);
        if (existing)
          append(
            existing,
            product,
            'low',
            facts,
            [unitRef, txRef],
            before,
            after,
          );
        else
          open(
            product,
            'historical_correction',
            'low',
            facts,
            [unitRef, txRef],
            before,
            after,
          );
      }
    }
  }

  // Cases for products that no longer exist are closed like archived products.
  for (const item of input.previousActiveCases) {
    if (
      item.productId &&
      !productIds.has(item.productId) &&
      !touched.has(item.id)
    ) {
      resolve(item, null, 'product_archived', { productName: null });
    }
  }

  // Threshold and correction cases expire after `expiryDays` daily evaluations without a further change.
  if (d.dailyEvaluation) {
    const byId = new Map(d.products.map((product) => [product.id, product]));
    for (const item of input.previousActiveCases) {
      if (
        touched.has(item.id) ||
        (item.type !== 'stock_threshold_change' &&
          item.type !== 'historical_correction')
      )
        continue;
      const product = item.productId
        ? (byId.get(item.productId) ?? null)
        : null;
      if (
        product &&
        daysBetween(item.lastChangeDate, day) >= input.settings.expiryDays
      ) {
        resolve(item, product, 'no_longer_detected', {
          productName: product.name,
        });
      }
    }
  }
  return ops;
}
