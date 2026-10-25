import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type {
  ChangeCaseType,
  ChangeDataProvenance,
  ChangeEvidenceEnvironment,
  ChangeIntelligenceSettings,
  ChangeReadiness,
  ChangeSeverity,
} from '@repo/shared';
import type { ChangeDbExecutor } from './change-work-queue.service';
import { instanceKey } from './engine/registry';
import {
  addDays,
  completedLocalDay,
  localDate,
  localDayStart,
} from './engine/local-time';
import { windowsFor } from './engine/rules';
import type {
  ActiveCase,
  AffectedSet,
  NodeKey,
  NodeState,
  ProductField,
  ProductObservation,
  SaleExclusionReason,
  SaleLineObservation,
} from './engine/types';

export type ChangeEventRow = {
  id: string;
  revision: bigint;
  sourceType: string;
  sourceId: string;
  operation: 'insert' | 'update' | 'delete';
  changedFields: string[];
  oldProductId: string | null;
  newProductId: string | null;
};

export type ChangeCoverage = {
  from: string;
  to: string;
  digitalSalesByEnvironment: Partial<Record<ChangeEvidenceEnvironment, number>>;
  cashSales: number;
  cashSalesProvenance: 'unknown';
  unassignedLines: number;
  excludedObservations: number;
  excludedByReason: Partial<Record<SaleExclusionReason, number>>;
  includesTestPayments: boolean;
};

export type LoadedChangeSource = {
  merchant: {
    id: string;
    publicId: string;
    timezone: string;
    dataProvenance: ChangeDataProvenance;
    isActive: boolean;
  };
  /** Pending events at or below the claimed revision, in revision order. */
  events: ChangeEventRow[];
  affected: AffectedSet;
  sales: SaleLineObservation[];
  products: ProductObservation[];
  previousStates: Record<string, NodeState>;
  activeCases: ActiveCase[];
  coverage: ChangeCoverage;
  /** Database time of the snapshot. */
  sourceCutoffAt: Date;
};

const PRODUCT_FIELDS: Record<string, ProductField> = {
  on_hand_quantity: 'on_hand',
  reserved_quantity: 'reserved',
  low_stock_threshold: 'threshold',
  status: 'status',
};
const ALL_PRODUCT_FIELDS: ProductField[] = [
  'on_hand',
  'reserved',
  'threshold',
  'status',
];

const rows = async <T>(
  tx: ChangeDbExecutor,
  query: ReturnType<typeof sql>,
): Promise<T[]> => (await tx.execute(query)).rows as unknown as T[];

const uuidArray = (ids: string[]) =>
  sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]::uuid[]`;

const toDate = (value: string | Date) =>
  value instanceof Date ? value : new Date(value);

/**
 * Canonical observations for one merchant (plan §4.3). Call inside one
 * REPEATABLE READ transaction so events, sales, products and states come from
 * the same snapshot. Sales are bounded to the windows the engine reads.
 */
@Injectable()
export class ChangeSourceLoader {
  async load(
    tx: ChangeDbExecutor,
    options: {
      merchantId: string;
      claimedRevision: bigint;
      asOf: Date;
      settings: ChangeIntelligenceSettings;
      /** Full re-evaluation: affected = 'all'. */
      full: boolean;
    },
  ): Promise<LoadedChangeSource> {
    const { merchantId } = options;
    const [merchantRow] = await rows<{
      id: string;
      public_id: string;
      timezone: string;
      data_provenance: ChangeDataProvenance;
      is_active: boolean;
      cutoff: string | Date;
    }>(
      tx,
      sql`SELECT id, public_id, timezone, data_provenance, is_active, now() AS cutoff
          FROM merchants WHERE id = ${merchantId}::uuid`,
    );
    if (!merchantRow) throw new Error(`Merchant ${merchantId} not found`);
    const timezone = merchantRow.timezone;

    const events = (
      await rows<{
        id: string;
        revision: string;
        source_type: string;
        source_id: string;
        operation: ChangeEventRow['operation'];
        changed_fields: string[];
        old_product_id: string | null;
        new_product_id: string | null;
      }>(
        tx,
        sql`SELECT id, revision::text, source_type, source_id, operation, changed_fields, old_product_id, new_product_id
            FROM merchant_change_events
            WHERE merchant_id = ${merchantId}::uuid AND status = 'pending'
              AND revision <= ${options.claimedRevision.toString()}::bigint
            ORDER BY revision, id`,
      )
    ).map(
      (row): ChangeEventRow => ({
        id: row.id,
        revision: BigInt(row.revision),
        sourceType: row.source_type,
        sourceId: row.source_id,
        operation: row.operation,
        changedFields: row.changed_fields,
        oldProductId: row.old_product_id,
        newProductId: row.new_product_id,
      }),
    );

    const products = await this.products(tx, merchantId);

    const day = completedLocalDay(options.asOf, timezone);
    const windows = windowsFor(day, options.settings);
    const from = localDayStart(windows.earliest, timezone);
    const to = localDayStart(addDays(day, 1), timezone);
    const sales = await this.sales(tx, merchantId, from, to);

    const previousStates: Record<string, NodeState> = {};
    for (const row of await rows<{
      product_id: string | null;
      node_key: NodeKey;
      value: unknown;
      readiness: ChangeReadiness;
      fingerprint: string;
      version: string;
    }>(
      tx,
      sql`SELECT product_id, node_key, value, readiness, fingerprint, version::text
          FROM merchant_change_states WHERE merchant_id = ${merchantId}::uuid`,
    )) {
      previousStates[instanceKey(row.node_key, row.product_id)] = {
        value: row.value,
        readiness: row.readiness,
        fingerprint: row.fingerprint,
        version: Number(row.version),
      };
    }

    const activeCases = (
      await rows<{
        id: string;
        product_id: string;
        case_type: ChangeCaseType;
        severity: ChangeSeverity;
        last_change_date: string | null;
        last_changed_at: string | Date;
      }>(
        tx,
        sql`SELECT id, product_id, case_type, severity, counters ->> 'lastChangeDate' AS last_change_date, last_changed_at
            FROM merchant_change_cases WHERE merchant_id = ${merchantId}::uuid AND status = 'active'`,
      )
    ).map(
      (row): ActiveCase => ({
        id: row.id,
        productId: row.product_id,
        type: row.case_type,
        severity: row.severity,
        lastChangeDate:
          row.last_change_date ??
          localDate(toDate(row.last_changed_at), timezone),
      }),
    );

    return {
      merchant: {
        id: merchantRow.id,
        publicId: merchantRow.public_id,
        timezone,
        dataProvenance: merchantRow.data_provenance,
        isActive: merchantRow.is_active,
      },
      events,
      affected: options.full
        ? 'all'
        : await this.affected(tx, merchantId, events, products),
      sales,
      products,
      previousStates,
      activeCases,
      coverage: coverage(sales, windows.earliest, day),
      sourceCutoffAt: toDate(merchantRow.cutoff),
    };
  }

  /** Every product, archived included, with its observation history start. */
  private async products(
    tx: ChangeDbExecutor,
    merchantId: string,
  ): Promise<ProductObservation[]> {
    // ponytail: first-sale lookup scans the merchant's full sale history once per run;
    // store a first_sale_at per product if the §9.6 benchmark shows it matters.
    const found = await rows<{
      id: string;
      name: string;
      status: 'active' | 'archived';
      on_hand_quantity: number;
      reserved_quantity: number;
      low_stock_threshold: number;
      history_start: string | Date | null;
    }>(
      tx,
      sql`WITH first_sale AS (
            SELECT product_id, min(occurred_at) AS at FROM (
              SELECT i.product_id, s.occurred_at FROM merchant_cash_sales s
                JOIN merchant_cash_sale_items i ON i.cash_sale_id = s.id
              WHERE s.merchant_id = ${merchantId}::uuid AND s.status = 'recorded' AND i.product_id IS NOT NULL
              UNION ALL
              SELECT ii.product_id, t.occurred_at FROM merchant_transactions t
                JOIN merchant_invoice_items ii ON ii.payment_request_id = t.payment_request_id
              WHERE t.merchant_id = ${merchantId}::uuid AND t.status = 'finalized' AND ii.product_id IS NOT NULL
            ) lines GROUP BY product_id
          )
          SELECT p.id, p.name, p.status, p.on_hand_quantity, p.reserved_quantity, p.low_stock_threshold,
            LEAST(p.created_at,
              (SELECT min(m.occurred_at) FROM merchant_stock_movements m WHERE m.product_id = p.id),
              (SELECT f.at FROM first_sale f WHERE f.product_id = p.id)) AS history_start
          FROM merchant_products p WHERE p.merchant_id = ${merchantId}::uuid ORDER BY p.id`,
    );
    return found.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      onHand: row.on_hand_quantity,
      reserved: row.reserved_quantity,
      threshold: row.low_stock_threshold,
      historyStart: row.history_start ? toDate(row.history_start) : null,
    }));
  }

  /** Eligible and excluded sale lines with `occurred_at` in [from, to). */
  private async sales(
    tx: ChangeDbExecutor,
    merchantId: string,
    from: Date,
    to: Date,
  ): Promise<SaleLineObservation[]> {
    const range = (column: ReturnType<typeof sql>) =>
      sql`${column} >= ${from.toISOString()}::timestamptz AND ${column} < ${to.toISOString()}::timestamptz`;
    const found = await rows<{
      sale_id: string;
      line_id: string;
      product_id: string | null;
      occurred_at: string | Date;
      recorded_at: string | Date;
      quantity: number;
      source: SaleLineObservation['source'];
      environment: SaleLineObservation['environment'];
      exclusion: SaleExclusionReason | null;
    }>(
      tx,
      sql`SELECT s.id AS sale_id, i.id AS line_id, i.product_id, s.occurred_at, s.recorded_at, i.quantity,
            'merchant_cash' AS source, 'unknown' AS environment,
            CASE WHEN s.status = 'recorded' THEN NULL ELSE 'voided' END AS exclusion
          FROM merchant_cash_sales s JOIN merchant_cash_sale_items i ON i.cash_sale_id = s.id
          WHERE s.merchant_id = ${merchantId}::uuid AND ${range(sql`s.occurred_at`)}
          UNION ALL
          SELECT t.id, ii.id, ii.product_id, t.occurred_at, t.finalized_at, ii.quantity,
            'mcbuse_payment', t.evidence_environment, NULL
          FROM merchant_transactions t JOIN merchant_invoice_items ii ON ii.payment_request_id = t.payment_request_id
          WHERE t.merchant_id = ${merchantId}::uuid AND t.status = 'finalized' AND ${range(sql`t.occurred_at`)}
          UNION ALL
          SELECT pr.id, ii.id, ii.product_id, pr.created_at AT TIME ZONE 'UTC', pr.created_at AT TIME ZONE 'UTC', ii.quantity,
            'mcbuse_payment', 'unknown',
            CASE WHEN pr.status = 'cancelled' THEN 'cancelled'
                 WHEN pr.status IN ('expired', 'failed') THEN 'failed' ELSE 'pending' END
          FROM payment_requests pr JOIN merchant_invoice_items ii ON ii.payment_request_id = pr.id
          WHERE pr.merchant_id = ${merchantId}::uuid AND pr.status <> 'completed'
            AND ${range(sql`(pr.created_at AT TIME ZONE 'UTC')`)}
            AND NOT EXISTS (SELECT 1 FROM merchant_transactions t2 WHERE t2.payment_request_id = pr.id)
          ORDER BY 4, 2`,
    );
    return found.map((row) => ({
      saleId: row.sale_id,
      sourceLineId: row.line_id,
      productId: row.product_id,
      occurredAt: toDate(row.occurred_at),
      recordedAt: toDate(row.recorded_at),
      quantity: row.quantity,
      source: row.source,
      environment: row.environment,
      eligible: row.exclusion === null,
      exclusionReason: row.exclusion,
    }));
  }

  /** Coalesces events into affected products and fields; never drops a product. */
  private async affected(
    tx: ChangeDbExecutor,
    merchantId: string,
    events: ChangeEventRow[],
    products: ProductObservation[],
  ): Promise<AffectedSet> {
    const fields = new Map<string, Set<ProductField>>();
    const merchant = new Set<'sales' | 'timezone'>();
    const mark = (productId: string | null, field: ProductField) => {
      if (!productId) {
        if (field === 'sales') merchant.add('sales');
        return;
      }
      const set = fields.get(productId) ?? new Set<ProductField>();
      set.add(field);
      fields.set(productId, set);
    };
    const markAllSales = () => {
      merchant.add('sales');
      for (const product of products) mark(product.id, 'sales');
    };
    const ids = (type: string) => [
      ...new Set(
        events.filter((e) => e.sourceType === type).map((e) => e.sourceId),
      ),
    ];

    // Sale headers: the products of their lines, read at load time (no item insert trigger).
    const linesOf = async (
      type: 'merchant_cash_sales' | 'merchant_transactions',
    ) => {
      const headerIds = ids(type);
      if (!headerIds.length) return;
      const found =
        type === 'merchant_cash_sales'
          ? await rows<{ header_id: string; product_id: string | null }>(
              tx,
              sql`SELECT s.id AS header_id, i.product_id FROM merchant_cash_sales s
                  LEFT JOIN merchant_cash_sale_items i ON i.cash_sale_id = s.id
                  WHERE s.merchant_id = ${merchantId}::uuid AND s.id = ANY(${uuidArray(headerIds)})`,
            )
          : await rows<{ header_id: string; product_id: string | null }>(
              tx,
              sql`SELECT t.id AS header_id, ii.product_id FROM merchant_transactions t
                  LEFT JOIN merchant_invoice_items ii ON ii.payment_request_id = t.payment_request_id
                  WHERE t.merchant_id = ${merchantId}::uuid AND t.id = ANY(${uuidArray(headerIds)})`,
            );
      for (const row of found) mark(row.product_id, 'sales');
      // A deleted header's lines are gone: re-check every product's sales.
      const seen = new Set(found.map((row) => row.header_id));
      if (headerIds.some((id) => !seen.has(id))) markAllSales();
    };
    await linesOf('merchant_cash_sales');
    await linesOf('merchant_transactions');

    for (const event of events) {
      switch (event.sourceType) {
        case 'merchant_cash_sale_items':
          mark(event.oldProductId, 'sales');
          mark(event.newProductId, 'sales');
          break;
        case 'merchant_products': {
          const productId = event.newProductId ?? event.oldProductId;
          if (event.operation === 'update')
            for (const column of event.changedFields) {
              const field = PRODUCT_FIELDS[column];
              if (field) mark(productId, field);
            }
          else if (event.operation === 'insert')
            for (const field of ALL_PRODUCT_FIELDS) mark(productId, field);
          // Deletes: the product is absent from the load; the engine closes its cases.
          break;
        }
        case 'merchants':
          if (event.changedFields.includes('timezone'))
            merchant.add('timezone');
          break;
      }
    }

    // Inventory imports: the products mapped from that source. Settlement imports are not demand.
    const batchIds = ids('merchant_import_batches');
    if (batchIds.length)
      for (const row of await rows<{ product_id: string }>(
        tx,
        sql`SELECT DISTINCT pm.product_id FROM merchant_import_batches b
            JOIN merchant_product_source_mappings pm ON pm.merchant_id = b.merchant_id AND pm.source_name = b.source_name
            WHERE b.merchant_id = ${merchantId}::uuid AND b.kind = 'inventory' AND b.id = ANY(${uuidArray(batchIds)})`,
      ))
        for (const field of ['on_hand', 'reserved', 'threshold'] as const)
          mark(row.product_id, field);

    return {
      products: Object.fromEntries(
        [...fields.entries()].map(([id, set]) => [id, [...set].sort()]),
      ),
      merchant: [...merchant].sort(),
    };
  }
}

function coverage(
  sales: SaleLineObservation[],
  from: string,
  to: string,
): ChangeCoverage {
  const digital = new Map<string, ChangeEvidenceEnvironment>();
  const cash = new Set<string>();
  const excludedByReason: ChangeCoverage['excludedByReason'] = {};
  let unassignedLines = 0;
  let excluded = 0;
  for (const line of sales) {
    if (!line.eligible) {
      excluded += 1;
      const reason = line.exclusionReason ?? 'malformed';
      excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1;
      continue;
    }
    if (line.productId === null) unassignedLines += 1;
    if (line.source === 'merchant_cash') cash.add(line.saleId);
    else digital.set(line.saleId, line.environment);
  }
  const digitalSalesByEnvironment: ChangeCoverage['digitalSalesByEnvironment'] =
    {};
  for (const environment of digital.values())
    digitalSalesByEnvironment[environment] =
      (digitalSalesByEnvironment[environment] ?? 0) + 1;
  return {
    from,
    to,
    digitalSalesByEnvironment,
    cashSales: cash.size,
    cashSalesProvenance: 'unknown',
    unassignedLines,
    excludedObservations: excluded,
    excludedByReason,
    includesTestPayments: [...digital.values()].some((env) => env !== 'live'),
  };
}
