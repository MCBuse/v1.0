import { randomUUID } from 'crypto';
import { Pool, type PoolClient } from 'pg';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import {
  createMerchantFixture,
  destroyMerchantFixture,
  type MerchantFixture,
} from '../database/testing/merchant-fixture';
import { percentile } from '../common/percentile';

/**
 * Plan §4.2 / §9.2: transactional change capture (migration 0038).
 * Each relevant source write records one event and advances the merchant's
 * work revision in the same transaction; irrelevant writes record nothing.
 */
describe('change capture (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  let merchant: MerchantFixture;
  let other: MerchantFixture;
  const staffUserIds: string[] = [];

  type EventRow = {
    source_type: string;
    source_id: string;
    operation: string;
    changed_fields: string[];
    old_product_id: string | null;
    new_product_id: string | null;
    revision: string;
    status: string;
  };

  const q = async <T = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
    client: Pool | PoolClient = pool,
  ) => (await client.query(text, values)).rows as T[];

  const events = (merchantId = merchant.merchantId) =>
    q<EventRow>(
      `SELECT source_type, source_id, operation, changed_fields, old_product_id,
              new_product_id, revision::text, status
         FROM merchant_change_events e WHERE merchant_id = $1 ORDER BY e.revision`,
      [merchantId],
    );

  const revision = async (merchantId = merchant.merchantId) =>
    (
      await q<{ r: string }>(
        `SELECT requested_revision::text AS r FROM merchant_change_work WHERE merchant_id = $1`,
        [merchantId],
      )
    )[0]?.r ?? null;

  /** Events written by `action`, and the revision advance it caused. */
  const capture = async (action: () => Promise<unknown>) => {
    const before = (await events()).length;
    const revBefore = BigInt((await revision()) ?? 0);
    await action();
    const after = await events();
    return {
      added: after.slice(before),
      advanced: BigInt((await revision()) ?? 0) - revBefore,
    };
  };

  const product = async (overrides: Partial<Record<string, unknown>> = {}) =>
    (
      await q<{ id: string }>(
        `INSERT INTO merchant_products (merchant_id, name, unit_price_minor, on_hand_quantity, low_stock_threshold)
         VALUES ($1, $2, 250, $3, 5) RETURNING id`,
        [
          overrides.merchantId ?? merchant.merchantId,
          overrides.name ?? 'Espresso',
          overrides.onHand ?? 50,
        ],
      )
    )[0].id;

  const cashSale = async (client: Pool | PoolClient = pool) =>
    (
      await q<{ id: string }>(
        `INSERT INTO merchant_cash_sales (merchant_id, receipt_number, amount_minor, occurred_at, actor_user_id, idempotency_key)
         VALUES ($1, $2, 500, now() - interval '1 hour', $3, $4) RETURNING id`,
        [
          merchant.merchantId,
          `CC-${randomUUID().slice(0, 12)}`,
          merchant.userId,
          randomUUID(),
        ],
        client,
      )
    )[0].id;

  const cashItem = async (
    saleId: string,
    productId: string,
    quantity = 2,
    client: Pool | PoolClient = pool,
  ) =>
    (
      await q<{ id: string }>(
        `INSERT INTO merchant_cash_sale_items (cash_sale_id, product_id, type, name, quantity, unit_price_minor, line_total_minor)
         VALUES ($1, $2, 'product', 'Espresso', $3, 250, $3 * 250) RETURNING id`,
        [saleId, productId, quantity],
        client,
      )
    )[0].id;

  /** The service's cash-sale write path: header, line, movement, stock. */
  const recordCashSale = async (
    productId: string,
    client: Pool | PoolClient = pool,
  ) => {
    const saleId = await cashSale(client);
    await cashItem(saleId, productId, 2, client);
    await q(
      `INSERT INTO merchant_stock_movements (merchant_id, product_id, kind, on_hand_change, reserved_change, reference_type, reference_id, occurred_at)
       VALUES ($1, $2, 'cash_sale', -2, 0, 'cash_sale', $3, now())`,
      [merchant.merchantId, productId, saleId],
      client,
    );
    await q(
      `UPDATE merchant_products SET on_hand_quantity = on_hand_quantity - 2, updated_at = now() WHERE id = $1`,
      [productId],
      client,
    );
    return saleId;
  };

  const paymentRequest = async () =>
    (
      await q<{ id: string }>(
        `INSERT INTO payment_requests (merchant_id, creator_wallet_id, nonce, type, amount, currency, status,
            display_amount_minor, display_currency, quote_rate_scaled, expires_at)
         VALUES ($1, $2, $3, 'dynamic', 500, 'USDC', 'pending', 500, 'EUR', 920000000, now() + interval '1 hour')
         RETURNING id`,
        [merchant.merchantId, merchant.routineWalletId, randomUUID()],
      )
    )[0].id;

  beforeAll(async () => {
    ({ db, pool } = await connectTestDatabase());
    merchant = await createMerchantFixture(db, 'Capture');
    other = await createMerchantFixture(db, 'CaptureOther');
  });

  afterAll(async () => {
    if (staffUserIds.length)
      await q(`DELETE FROM staff_permissions WHERE user_id = ANY($1::uuid[])`, [
        staffUserIds,
      ]);
    // Change tables cascade from merchants.
    if (merchant) await destroyMerchantFixture(db, merchant);
    if (other) await destroyMerchantFixture(db, other);
    await pool.end();
  });

  it('creates the work row on first capture and advances it per event', async () => {
    expect(await revision(other.merchantId)).toBeNull();
    await product({ merchantId: other.merchantId });
    await product({ merchantId: other.merchantId, name: 'Latte' });
    const work = (
      await q<Record<string, unknown>>(
        `SELECT requested_revision::text, processed_revision::text, status, bootstrap_status
           FROM merchant_change_work WHERE merchant_id = $1`,
        [other.merchantId],
      )
    )[0];
    expect(work).toEqual({
      requested_revision: '2',
      processed_revision: '0',
      status: 'idle',
      bootstrap_status: 'pending',
    });
    const rows = await events(other.merchantId);
    expect(rows.map((e) => [e.operation, e.revision, e.status])).toEqual([
      ['insert', '1', 'pending'],
      ['insert', '2', 'pending'],
    ]);
    // Tenant isolation: nothing leaked to the other merchant.
    expect(await events()).toEqual([]);
  });

  it('is atomic with the source write: a rollback leaves no event and no revision bump', async () => {
    const productId = await product();
    const revBefore = await revision();
    const countBefore = (await events()).length;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await recordCashSale(productId, client);
      // Uncommitted events are invisible to other sessions.
      expect((await events()).length).toBe(countBefore);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    expect(await revision()).toBe(revBefore);
    expect((await events()).length).toBe(countBefore);
  });

  describe('merchant_products', () => {
    it('captures insert, stock, reservation, threshold and archive changes with their fields', async () => {
      let productId = '';
      const inserted = await capture(async () => {
        productId = await product();
      });
      expect(inserted.added).toEqual([
        expect.objectContaining({
          source_type: 'merchant_products',
          source_id: productId,
          operation: 'insert',
          changed_fields: [],
          old_product_id: null,
          new_product_id: productId,
        }),
      ]);
      expect(inserted.advanced).toBe(1n);

      const cases: Array<[string, string[]]> = [
        ['on_hand_quantity = on_hand_quantity + 10', ['on_hand_quantity']],
        ['reserved_quantity = 3', ['reserved_quantity']],
        ['low_stock_threshold = 8', ['low_stock_threshold']],
        ["status = 'archived'", ['status']],
        [
          'on_hand_quantity = 70, low_stock_threshold = 9',
          ['on_hand_quantity', 'low_stock_threshold'],
        ],
      ];
      for (const [set, fields] of cases) {
        const result = await capture(() =>
          q(`UPDATE merchant_products SET ${set} WHERE id = $1`, [productId]),
        );
        expect(result.added).toEqual([
          expect.objectContaining({
            operation: 'update',
            changed_fields: fields,
            old_product_id: productId,
            new_product_id: productId,
          }),
        ]);
        expect(result.advanced).toBe(1n);
      }
    });

    it('ignores name, description, image, price and no-op updates', async () => {
      const productId = await product();
      const result = await capture(async () => {
        await q(
          `UPDATE merchant_products SET name = 'Doppio', description = 'Strong', image_object_key = 'img/x.png',
             unit_price_minor = 300, category = 'Hot', updated_at = now() WHERE id = $1`,
          [productId],
        );
        await q(
          `UPDATE merchant_products SET on_hand_quantity = on_hand_quantity, status = status WHERE id = $1`,
          [productId],
        );
      });
      expect(result).toEqual({ added: [], advanced: 0n });
    });

    it('captures deletion', async () => {
      const productId = await product();
      const result = await capture(() =>
        q(`DELETE FROM merchant_products WHERE id = $1`, [productId]),
      );
      expect(result.added).toEqual([
        expect.objectContaining({
          operation: 'delete',
          old_product_id: productId,
          new_product_id: null,
        }),
      ]);
    });
  });

  describe('cash sales', () => {
    it('records at most two events for a single-product sale: header and stock update', async () => {
      const productId = await product();
      let saleId = '';
      const result = await capture(async () => {
        saleId = await recordCashSale(productId);
      });
      expect(
        result.added.map((e) => [e.source_type, e.operation, e.source_id]),
      ).toEqual([
        ['merchant_cash_sales', 'insert', saleId],
        ['merchant_products', 'update', productId],
      ]);
      expect(result.advanced).toBe(2n);
    });

    it('captures a void and an occurred_at correction, but not description edits', async () => {
      const productId = await product();
      const saleId = await recordCashSale(productId);

      const edit = await capture(() =>
        q(`UPDATE merchant_cash_sales SET description = 'note' WHERE id = $1`, [
          saleId,
        ]),
      );
      expect(edit.added).toEqual([]);

      const moved = await capture(() =>
        q(
          `UPDATE merchant_cash_sales SET occurred_at = occurred_at - interval '1 day' WHERE id = $1`,
          [saleId],
        ),
      );
      expect(moved.added).toEqual([
        expect.objectContaining({
          source_type: 'merchant_cash_sales',
          operation: 'update',
          changed_fields: ['occurred_at'],
        }),
      ]);

      const voided = await capture(() =>
        q(
          `UPDATE merchant_cash_sales SET status = 'voided', void_reason = 'mistake', voided_at = now() WHERE id = $1`,
          [saleId],
        ),
      );
      expect(voided.added).toEqual([
        expect.objectContaining({
          source_type: 'merchant_cash_sales',
          source_id: saleId,
          changed_fields: ['status'],
        }),
      ]);
    });

    it('does not capture a sale inserted as voided', async () => {
      const result = await capture(() =>
        q(
          `INSERT INTO merchant_cash_sales (merchant_id, receipt_number, amount_minor, occurred_at, actor_user_id, idempotency_key, status)
           VALUES ($1, $2, 500, now(), $3, $4, 'voided')`,
          [
            merchant.merchantId,
            `CV-${randomUUID().slice(0, 12)}`,
            merchant.userId,
            randomUUID(),
          ],
        ),
      );
      expect(result.added).toEqual([]);
    });

    it('records old and new product when a line is reassigned, resolving the merchant via the sale', async () => {
      const first = await product({ name: 'Cappuccino' });
      const second = await product({ name: 'Flat white' });
      const saleId = await cashSale();
      const itemId = await cashItem(saleId, first);

      const insertOnly = await capture(() => cashItem(saleId, second));
      expect(insertOnly.added).toEqual([]); // item inserts are covered by the header

      const reassigned = await capture(() =>
        q(`UPDATE merchant_cash_sale_items SET product_id = $2 WHERE id = $1`, [
          itemId,
          second,
        ]),
      );
      expect(reassigned.added).toEqual([
        expect.objectContaining({
          source_type: 'merchant_cash_sale_items',
          source_id: itemId,
          operation: 'update',
          changed_fields: ['product_id'],
          old_product_id: first,
          new_product_id: second,
        }),
      ]);

      const quantity = await capture(() =>
        q(`UPDATE merchant_cash_sale_items SET quantity = 5 WHERE id = $1`, [
          itemId,
        ]),
      );
      expect(quantity.added).toEqual([
        expect.objectContaining({
          changed_fields: ['quantity'],
          old_product_id: second,
          new_product_id: second,
        }),
      ]);

      const renamed = await capture(() =>
        q(
          `UPDATE merchant_cash_sale_items SET name = 'Renamed' WHERE id = $1`,
          [itemId],
        ),
      );
      expect(renamed.added).toEqual([]);

      const deleted = await capture(() =>
        q(`DELETE FROM merchant_cash_sale_items WHERE id = $1`, [itemId]),
      );
      expect(deleted.added).toEqual([
        expect.objectContaining({
          operation: 'delete',
          old_product_id: second,
          new_product_id: null,
        }),
      ]);
    });
  });

  describe('digital sales', () => {
    it('ignores invoice-item inserts on an unpaid request and captures the finalized transaction', async () => {
      const productId = await product();
      const requestId = await paymentRequest();

      const items = await capture(() =>
        q(
          `INSERT INTO merchant_invoice_items (payment_request_id, product_id, type, name, quantity, unit_price_minor, line_total_minor)
           VALUES ($1, $2, 'product', 'Espresso', 2, 250, 500)`,
          [requestId, productId],
        ),
      );
      expect(items).toEqual({ added: [], advanced: 0n });

      const [entry] = await q<{ id: string }>(
        `INSERT INTO ledger_entries (debit_wallet_id, credit_wallet_id, amount, currency, type, status, idempotency_key)
         VALUES ($1, $2, 500, 'USDC', 'p2p', 'completed', $3) RETURNING id`,
        [merchant.holdingWalletId, merchant.routineWalletId, randomUUID()],
      );
      let transactionId = '';
      const finalized = await capture(async () => {
        transactionId = (
          await q<{ id: string }>(
            `INSERT INTO merchant_transactions (receipt_number, merchant_id, payment_request_id, ledger_entry_id,
               display_amount_minor, settlement_amount, settlement_currency, quote_rate_scaled, status,
               evidence_environment, occurred_at, finalized_at)
             VALUES ($1, $2, $3, $4, 500, 5000000, 'USDC', 920000000, 'finalized', 'test', now(), now())
             RETURNING id`,
            [
              `MCB-${randomUUID().slice(0, 12)}`,
              merchant.merchantId,
              requestId,
              entry.id,
            ],
          )
        )[0].id;
      });
      expect(finalized.added).toEqual([
        expect.objectContaining({
          source_type: 'merchant_transactions',
          source_id: transactionId,
          operation: 'insert',
          old_product_id: null,
          new_product_id: null,
        }),
      ]);

      const described = await capture(() =>
        q(
          `UPDATE merchant_transactions SET description = 'x', merchant_name_snapshot = 'y' WHERE id = $1`,
          [transactionId],
        ),
      );
      expect(described.added).toEqual([]);

      const moved = await capture(() =>
        q(
          `UPDATE merchant_transactions SET occurred_at = occurred_at - interval '2 hours' WHERE id = $1`,
          [transactionId],
        ),
      );
      expect(moved.added).toEqual([
        expect.objectContaining({ changed_fields: ['occurred_at'] }),
      ]);

      const removed = await capture(() =>
        q(`DELETE FROM merchant_transactions WHERE id = $1`, [transactionId]),
      );
      expect(removed.added).toEqual([
        expect.objectContaining({ operation: 'delete' }),
      ]);
    });

    it('ignores stock-movement inserts', async () => {
      const productId = await product();
      const result = await capture(() =>
        q(
          `INSERT INTO merchant_stock_movements (merchant_id, product_id, kind, on_hand_change, reserved_change, reference_type, occurred_at)
           VALUES ($1, $2, 'adjustment', 5, 0, 'manual', now())`,
          [merchant.merchantId, productId],
        ),
      );
      expect(result).toEqual({ added: [], advanced: 0n });
    });
  });

  it('captures an import only when it becomes committed', async () => {
    const [batch] = await q<{ id: string }>(
      `INSERT INTO merchant_import_batches (merchant_id, kind, source_name, content_hash, mapping, rows_json, actor_user_id)
       VALUES ($1, 'inventory', 'stock.csv', $2, '{}', '[]', $3) RETURNING id`,
      [merchant.merchantId, randomUUID().replace(/-/g, ''), merchant.userId],
    );
    const previewEdit = await capture(() =>
      q(
        `UPDATE merchant_import_batches SET mapping = '{"a":1}' WHERE id = $1`,
        [batch.id],
      ),
    );
    expect(previewEdit.added).toEqual([]);

    const committed = await capture(() =>
      q(
        `UPDATE merchant_import_batches SET status = 'committed', committed_at = now() WHERE id = $1`,
        [batch.id],
      ),
    );
    expect(committed.added).toEqual([
      expect.objectContaining({
        source_type: 'merchant_import_batches',
        source_id: batch.id,
        changed_fields: ['status'],
      }),
    ]);

    const again = await capture(() =>
      q(
        `UPDATE merchant_import_batches SET committed_at = now() WHERE id = $1`,
        [batch.id],
      ),
    );
    expect(again.added).toEqual([]);
  });

  it('captures a timezone change but not other merchant edits', async () => {
    const other = await capture(() =>
      q(
        `UPDATE merchants SET business_name = 'Renamed Shop', updated_at = now() WHERE id = $1`,
        [merchant.merchantId],
      ),
    );
    expect(other.added).toEqual([]);

    const tz = await capture(() =>
      q(`UPDATE merchants SET timezone = 'Africa/Accra' WHERE id = $1`, [
        merchant.merchantId,
      ]),
    );
    expect(tz.added).toEqual([
      expect.objectContaining({
        source_type: 'merchants',
        source_id: merchant.merchantId,
        changed_fields: ['timezone'],
      }),
    ]);
  });

  it('defaults data_provenance to ordinary and rejects unknown values', async () => {
    const [row] = await q<{ data_provenance: string }>(
      `SELECT data_provenance FROM merchants WHERE id = $1`,
      [merchant.merchantId],
    );
    expect(row.data_provenance).toBe('ordinary');
    await expect(
      q(`UPDATE merchants SET data_provenance = 'demo' WHERE id = $1`, [
        merchant.merchantId,
      ]),
    ).rejects.toThrow(/data_provenance_check/);
  });

  it('lets one staff user hold both credit_analyst and change_intelligence_operator', async () => {
    staffUserIds.push(merchant.userId);
    await q(
      `INSERT INTO staff_permissions (user_id, permission) VALUES ($1, 'credit_analyst'), ($1, 'change_intelligence_operator')`,
      [merchant.userId],
    );
    const rows = await q<{ permission: string }>(
      `SELECT permission FROM staff_permissions WHERE user_id = $1 ORDER BY permission`,
      [merchant.userId],
    );
    expect(rows.map((r) => r.permission)).toEqual([
      'change_intelligence_operator',
      'credit_analyst',
    ]);
    await expect(
      q(
        `INSERT INTO staff_permissions (user_id, permission) VALUES ($1, 'credit_analyst')`,
        [merchant.userId],
      ),
    ).rejects.toThrow(/staff_permissions_pkey/);
    await expect(
      q(
        `INSERT INTO staff_permissions (user_id, permission) VALUES ($1, 'superuser')`,
        [merchant.userId],
      ),
    ).rejects.toThrow(/permission_check/);
  });

  it('keeps transitions immutable and allows one active case per product and type', async () => {
    const productId = await product();
    const [run] = await q<{ id: string }>(
      `INSERT INTO merchant_change_runs (merchant_id, model_version, settings, settings_fingerprint, as_of,
         source_revision, source_cutoff_at, reason, status, started_at)
       VALUES ($1, 'change-intelligence-v1', '{}', 'f', now(), 0, now(), 'initialization', 'succeeded', now())
       RETURNING id`,
      [merchant.merchantId],
    );
    const insertCase = () =>
      q<{ id: string }>(
        `INSERT INTO merchant_change_cases (merchant_id, product_id, case_type, severity, priority, first_detected_at,
           last_detected_at, last_changed_at, settings, settings_fingerprint, model_version)
         VALUES ($1, $2, 'stock_risk', 'high', 2, now(), now(), now(), '{}', 'f', 'change-intelligence-v1') RETURNING id`,
        [merchant.merchantId, productId],
      );
    const [first] = await insertCase();
    await expect(insertCase()).rejects.toThrow(/one_active/);
    await q(
      `UPDATE merchant_change_cases SET status = 'resolved', resolution = 'stock_normal', resolved_at = now() WHERE id = $1`,
      [first.id],
    );
    await expect(insertCase()).resolves.toHaveLength(1);

    const [transition] = await q<{ id: string }>(
      `INSERT INTO merchant_change_transitions (merchant_id, product_id, node_key, to_version, after_value, after_readiness, run_id, case_id)
       VALUES ($1, $2, 'stock_risk', 1, '{"level":"low_stock"}', 'ready', $3, $4) RETURNING id`,
      [merchant.merchantId, productId, run.id, first.id],
    );
    await expect(
      q(
        `UPDATE merchant_change_transitions SET after_value = '{}' WHERE id = $1`,
        [transition.id],
      ),
    ).rejects.toThrow(/immutable/);

    // A run of another merchant cannot be referenced (composite FK).
    await expect(
      q(
        `INSERT INTO merchant_change_states (merchant_id, node_key, value, readiness, fingerprint, last_changed_at, run_id)
         VALUES ($1, 'merchant_summary', '{}', 'ready', 'f', now(), $2)`,
        [other.merchantId, run.id],
      ),
    ).rejects.toThrow(/run_fk/);

    // Merchant-level states are unique despite the NULL product.
    const state = () =>
      q(
        `INSERT INTO merchant_change_states (merchant_id, node_key, value, readiness, fingerprint, last_changed_at, run_id)
         VALUES ($1, 'merchant_summary', '{}', 'ready', 'f', now(), $2)
         ON CONFLICT (merchant_id, product_id, node_key) DO UPDATE SET version = merchant_change_states.version + 1
         RETURNING version::text`,
        [merchant.merchantId, run.id],
      );
    expect(await state()).toEqual([{ version: '1' }]);
    expect(await state()).toEqual([{ version: '2' }]);
  });

  it('denies client roles direct access to every change table', async () => {
    const rows = await q<{ relname: string; rls: boolean }>(
      `SELECT relname, relrowsecurity AS rls FROM pg_class
        WHERE relname LIKE 'merchant_change_%' AND relkind = 'r' ORDER BY relname`,
    );
    expect(rows).toEqual(
      [
        'merchant_change_cases',
        'merchant_change_events',
        'merchant_change_runs',
        'merchant_change_states',
        'merchant_change_transitions',
        'merchant_change_work',
      ].map((relname) => ({ relname, rls: true })),
    );
    const roles = await q<{ rolname: string }>(
      `SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')`,
    );
    for (const { rolname } of roles)
      for (const { relname } of rows) {
        const [grant] = await q<{ ok: boolean }>(
          `SELECT has_table_privilege($1, $2, 'SELECT') AS ok`,
          [rolname, relname],
        );
        expect(grant.ok).toBe(false);
      }
  });

  /**
   * Smoke version of plan §9.6 "Source-write p95 regression ≤ 10%": same
   * operations with the change_capture_* triggers enabled and then disabled
   * (legacy analytics triggers stay on in both runs). The gate itself is
   * measured through the HTTP API by `pnpm changes:load`
   * (docs/evaluations/change-intelligence/performance.md); 1,000 rounds here
   * (10,000 writes) exceeded the timeout on a loaded machine.
   */
  it('measures source-write overhead of capture', async () => {
    const ROUNDS = 200;
    const productId = await product({ onHand: 100_000 });
    const captureTriggers = [
      ['merchant_products', 'change_capture_products_update'],
      ['merchant_cash_sales', 'change_capture_cash_sales_insert'],
    ];
    const setTriggers = async (enabled: boolean) => {
      for (const [table, trigger] of captureTriggers)
        await q(
          `ALTER TABLE ${table} ${enabled ? 'ENABLE' : 'DISABLE'} TRIGGER ${trigger}`,
        );
    };

    const time = async (op: () => Promise<unknown>) => {
      const samples: number[] = [];
      for (let i = 0; i < ROUNDS; i += 1) {
        const started = performance.now();
        await op();
        samples.push(performance.now() - started);
      }
      return samples;
    };
    const productUpdate = () =>
      q(
        `UPDATE merchant_products SET on_hand_quantity = on_hand_quantity - 1, updated_at = now() WHERE id = $1`,
        [productId],
      );
    const cashSaleWrite = async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await recordCashSale(productId, client);
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    };

    const results: Record<string, Record<string, number>> = {};
    try {
      for (const [name, op] of [
        ['product update', productUpdate],
        ['cash sale (header+line+movement+stock)', cashSaleWrite],
      ] as const) {
        // Warm-up, then interleave disabled/enabled blocks to cancel drift.
        await time(op);
        const on: number[] = [];
        const off: number[] = [];
        for (let block = 0; block < 2; block += 1) {
          await setTriggers(false);
          off.push(...(await time(op)));
          await setTriggers(true);
          on.push(...(await time(op)));
        }
        const p50Off = percentile(off, 50);
        const p95Off = percentile(off, 95);
        const p50On = percentile(on, 50);
        const p95On = percentile(on, 95);
        results[name] = {
          samples: on.length,
          p50_off_ms: +p50Off.toFixed(3),
          p50_on_ms: +p50On.toFixed(3),
          p95_off_ms: +p95Off.toFixed(3),
          p95_on_ms: +p95On.toFixed(3),
          p95_regression_pct: +((100 * (p95On - p95Off)) / p95Off).toFixed(1),
        };
      }
    } finally {
      await setTriggers(true);
    }

    console.log(
      `change capture source-write overhead (local Postgres, sequential, ${ROUNDS * 2} samples each):\n` +
        JSON.stringify(results, null, 2),
    );
    // Capture ran during the enabled blocks.
    expect(
      (await events()).filter((e) => e.source_id === productId).length,
    ).toBeGreaterThanOrEqual(ROUNDS * 2);
  }, 120_000);
});
