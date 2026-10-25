import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type {
  ChangeAttentionPriority,
  ChangeCaseType,
  ChangeReadiness,
  RunReason,
} from '@repo/shared';
import type { LoadedChangeSource } from './change-source.loader';
import {
  ChangeWorkQueueService,
  type ChangeDbExecutor,
  type ClaimedChangeWork,
} from './change-work-queue.service';
import { sha256Hex } from './engine/canonical';
import { addDays, localDate, localDayStart } from './engine/local-time';
import { instanceKey } from './engine/registry';
import type {
  CaseOperation,
  EvaluationResult,
  NodeState,
} from './engine/types';

export type PublishRun = {
  id: string;
  reason: RunReason;
  startedAt: Date;
  requestedByUserId: string | null;
};

export type PublishSummary = {
  runId: string;
  states: number;
  transitions: number;
  cases: { opened: number; appended: number; resolved: number };
  events: number;
  readiness: Partial<Record<ChangeReadiness, number>>;
  fingerprint: string;
};

const DEMAND_NODE: Partial<
  Record<ChangeCaseType, 'unit_demand_change' | 'transaction_change'>
> = {
  unit_demand_increase: 'unit_demand_change',
  unit_demand_decrease: 'unit_demand_change',
  transaction_velocity_increase: 'transaction_change',
  transaction_velocity_decrease: 'transaction_change',
};

/** §3.4: 1 out of stock, 2 low stock, 3 projected risk, 4 confirmed demand, 5 other. */
export function casePriority(op: CaseOperation): ChangeAttentionPriority {
  if (op.type === 'stock_risk')
    return op.facts.riskLevel === 'out_of_stock'
      ? 1
      : op.facts.riskLevel === 'low_stock'
        ? 2
        : 3;
  return DEMAND_NODE[op.type] ? 4 : 5;
}

const kindOf = (op: CaseOperation) =>
  op.op === 'resolve'
    ? 'resolved'
    : op.type === 'historical_correction'
      ? 'correction'
      : op.op === 'open'
        ? 'opened'
        : 'updated';

/**
 * Atomic publication (plan §4.4 steps 7–9). Runs inside the caller's
 * transaction: verifies the lease, then writes the run, changed states,
 * transitions, cases, processed events and work completion. The caller
 * commits; nothing is visible before that.
 */
@Injectable()
export class ChangePublisherService {
  constructor(private readonly queue: ChangeWorkQueueService) {}

  async publish(
    tx: ChangeDbExecutor,
    work: ClaimedChangeWork,
    run: PublishRun,
    source: LoadedChangeSource,
    result: EvaluationResult,
  ): Promise<PublishSummary> {
    await this.queue.lockForPublish(tx, work);
    const merchantId = work.merchantId;
    const asOf = result.asOf.toISOString();

    const finalStates: Record<string, NodeState> = { ...source.previousStates };
    for (const state of result.states) finalStates[state.instanceKey] = state;
    const fingerprint = sha256Hex(
      Object.fromEntries(
        Object.entries(finalStates).map(([key, state]) => [
          key,
          state.fingerprint,
        ]),
      ),
    );
    const readiness: PublishSummary['readiness'] = {};
    for (const product of source.products) {
      if (product.status !== 'active') continue;
      const state = finalStates[instanceKey('unit_demand_change', product.id)];
      if (state)
        readiness[state.readiness] = (readiness[state.readiness] ?? 0) + 1;
    }
    const caseCounts = { opened: 0, appended: 0, resolved: 0 };
    for (const op of result.caseOperations)
      caseCounts[
        op.op === 'open'
          ? 'opened'
          : op.op === 'append'
            ? 'appended'
            : 'resolved'
      ] += 1;

    await tx.execute(sql`
      INSERT INTO merchant_change_runs (id, merchant_id, model_version, settings, settings_fingerprint, as_of,
        source_revision, source_cutoff_at, reason, status, started_at, duration_ms, counts, coverage, fingerprint,
        requested_by_user_id)
      VALUES (${run.id}::uuid, ${merchantId}::uuid, ${result.modelVersion}, ${JSON.stringify(result.settings)}::jsonb,
        ${result.settingsFingerprint}, ${asOf}::timestamptz, ${work.claimedRevision.toString()}::bigint,
        ${source.sourceCutoffAt.toISOString()}::timestamptz, ${run.reason}, 'succeeded',
        ${run.startedAt.toISOString()}::timestamptz, ${Math.max(0, Date.now() - run.startedAt.getTime())},
        ${JSON.stringify({
          ...result.counts,
          events: source.events.length,
          products: source.products.length,
          states: result.states.length,
          transitions: result.transitions.length,
          cases: caseCounts,
          readiness,
        })}::jsonb,
        ${JSON.stringify(source.coverage)}::jsonb, ${fingerprint}, ${run.requestedByUserId}::uuid)`);

    if (result.states.length)
      await tx.execute(sql`
        INSERT INTO merchant_change_states (merchant_id, product_id, node_key, value, readiness, fingerprint, version, last_changed_at, run_id)
        SELECT ${merchantId}::uuid, r.product_id, r.node_key, r.value, r.readiness, r.fingerprint, r.version,
          ${asOf}::timestamptz, ${run.id}::uuid
        FROM jsonb_to_recordset(${JSON.stringify(
          result.states.map((state) => ({
            product_id: state.productId,
            node_key: state.nodeKey,
            value: state.value,
            readiness: state.readiness,
            fingerprint: state.fingerprint,
            version: state.version,
          })),
        )}::jsonb) AS r(product_id uuid, node_key text, value jsonb, readiness text, fingerprint text, version bigint)
        ON CONFLICT ON CONSTRAINT merchant_change_states_identity DO UPDATE SET
          value = excluded.value, readiness = excluded.readiness, fingerprint = excluded.fingerprint,
          version = excluded.version, last_changed_at = excluded.last_changed_at, run_id = excluded.run_id`);

    // Node transitions; parents that changed in this run are linked by id.
    const transitionIds = new Map(
      result.transitions.map((t) => [t.instanceKey, randomUUID()]),
    );
    if (result.transitions.length)
      await tx.execute(sql`
        INSERT INTO merchant_change_transitions (id, merchant_id, product_id, node_key, from_version, to_version,
          before_value, after_value, before_readiness, after_readiness, parent_transition_ids, run_id, explanation, created_at)
        SELECT r.id, ${merchantId}::uuid, r.product_id, r.node_key, r.from_version, r.to_version, r.before_value,
          r.after_value, r.before_readiness, r.after_readiness, r.parent_ids, ${run.id}::uuid, r.explanation, ${asOf}::timestamptz
        FROM jsonb_to_recordset(${JSON.stringify(
          result.transitions.map((t) => ({
            id: transitionIds.get(t.instanceKey),
            product_id: t.productId,
            node_key: t.nodeKey,
            from_version: t.before?.version ?? null,
            to_version: t.after.version,
            before_value: t.before?.value ?? null,
            after_value: t.after.value,
            before_readiness: t.before?.readiness ?? null,
            after_readiness: t.after.readiness,
            parent_ids: t.parents.flatMap((parent) => {
              const id = transitionIds.get(parent.instanceKey);
              return id ? [id] : [];
            }),
            explanation: {
              reason: run.reason,
              facts: t.explanation,
              parents: t.parents,
            },
          })),
        )}::jsonb) AS r(id uuid, product_id uuid, node_key text, from_version bigint, to_version bigint,
          before_value jsonb, after_value jsonb, before_readiness text, after_readiness text, parent_ids uuid[], explanation jsonb)`);

    for (const op of result.caseOperations)
      await this.applyCase(tx, {
        merchantId,
        runId: run.id,
        reason: run.reason,
        asOf,
        localDate: result.localDate,
        op,
        result,
        finalStates,
        transitionIds,
      });

    if (source.events.length)
      await tx.execute(sql`
        UPDATE merchant_change_events SET
          status = ${run.reason === 'initialization' || run.reason === 'reconciliation' ? 'resolved' : 'processed'},
          run_id = ${run.id}::uuid, processed_at = now()
        WHERE merchant_id = ${merchantId}::uuid AND status = 'pending'
          AND id = ANY(ARRAY[${sql.join(
            source.events.map((event) => sql`${event.id}::uuid`),
            sql`, `,
          )}]::uuid[])`);

    await this.queue.completeInTx(tx, work, {
      reason: run.reason,
      lastDailyEvaluationDate: result.dailyEvaluationDate,
      nextDailyEvaluationAt: localDayStart(
        addDays(localDate(result.asOf, result.timezone), 1),
        result.timezone,
      ),
      settingsFingerprint: result.settingsFingerprint,
    });

    return {
      runId: run.id,
      states: result.states.length,
      transitions: result.transitions.length,
      cases: caseCounts,
      events: source.events.length,
      readiness,
      fingerprint,
    };
  }

  /** Opens, appends to or resolves one case and records its history entry. */
  private async applyCase(
    tx: ChangeDbExecutor,
    c: {
      merchantId: string;
      runId: string;
      reason: RunReason;
      asOf: string;
      localDate: string;
      op: CaseOperation;
      result: EvaluationResult;
      finalStates: Record<string, NodeState>;
      transitionIds: Map<string, string>;
    },
  ): Promise<void> {
    const { op } = c;
    if (!op.productId)
      throw new Error(`Case operation ${op.op} ${op.type} has no product`);
    const transitionId = randomUUID();
    const demandNode = DEMAND_NODE[op.type];
    const lifecycleState = demandNode
      ? c.finalStates[instanceKey(demandNode, op.productId)]?.value
      : undefined;
    const lifecycle =
      lifecycleState && typeof lifecycleState === 'object'
        ? (lifecycleState as { lifecycle?: unknown }).lifecycle
        : undefined;
    const evidence = JSON.stringify({
      facts: op.facts,
      explanation: op.explanation,
      before: op.before,
      after: op.after,
      observation: op.observation,
    });
    const counters = (entries: ReturnType<typeof sql>) =>
      sql`jsonb_build_object('entries', ${entries}, 'lastChangeDate', ${c.localDate}::text, 'lifecycle', ${JSON.stringify(lifecycle ?? null)}::jsonb)`;

    let caseId: string;
    let entries: number;
    if (op.op === 'open') {
      caseId = randomUUID();
      entries = 1;
      await tx.execute(sql`
        INSERT INTO merchant_change_cases (id, merchant_id, product_id, case_type, status, severity, priority,
          first_detected_at, last_detected_at, last_changed_at, latest_transition_id, evidence, counters, settings,
          settings_fingerprint, model_version, identified_during_initial_analysis, created_at, updated_at)
        VALUES (${caseId}::uuid, ${c.merchantId}::uuid, ${op.productId}::uuid, ${op.type}, 'active', ${op.severity},
          ${casePriority(op)}, ${c.asOf}::timestamptz, ${c.asOf}::timestamptz, ${c.asOf}::timestamptz,
          ${transitionId}::uuid, ${evidence}::jsonb, ${counters(sql`1`)},
          ${JSON.stringify(c.result.settings)}::jsonb, ${op.settingsFingerprint}, ${c.result.modelVersion},
          ${op.identifiedDuringInitialAnalysis}, now(), now())`);
    } else {
      // Cases keep the settings snapshot that opened them (§5.11); each entry records its own.
      const updated = await tx.execute(sql`
        UPDATE merchant_change_cases SET
          last_changed_at = ${c.asOf}::timestamptz, latest_transition_id = ${transitionId}::uuid,
          evidence = ${evidence}::jsonb, updated_at = now(),
          counters = ${counters(sql`COALESCE((counters ->> 'entries')::int, 0) + 1`)},
          ${
            op.op === 'append'
              ? sql`severity = ${op.severity}, priority = ${casePriority(op)}, last_detected_at = ${c.asOf}::timestamptz,
                  not_rechecked_since = ${op.notRecheckedSince}::date`
              : sql`status = 'resolved', resolution = ${op.resolution}, resolved_at = ${c.asOf}::timestamptz`
          }
        WHERE id = ${op.caseId}::uuid AND merchant_id = ${c.merchantId}::uuid AND status = 'active'
        RETURNING (counters ->> 'entries')::int AS entries`);
      const row = updated.rows[0] as { entries: number } | undefined;
      if (!row)
        throw new Error(`Active case ${op.caseId} not found for ${op.op}`);
      caseId = op.caseId;
      entries = row.entries;
    }

    const primary = op.transitionRefs[0];
    await tx.execute(sql`
      INSERT INTO merchant_change_transitions (id, merchant_id, product_id, node_key, from_version, to_version,
        before_value, after_value, before_readiness, after_readiness, parent_transition_ids, run_id, explanation, case_id, created_at)
      VALUES (${transitionId}::uuid, ${c.merchantId}::uuid, ${op.productId}::uuid, ${`case:${op.type}`},
        ${entries > 1 ? entries - 1 : null}::bigint, ${entries}::bigint,
        ${JSON.stringify({ values: op.before })}::jsonb, ${JSON.stringify({ values: op.after })}::jsonb, NULL,
        ${(primary && c.finalStates[primary]?.readiness) || 'ready'},
        array_remove(ARRAY[${sql.join(
          [
            sql`NULL::uuid`,
            ...op.transitionRefs.flatMap((ref) => {
              const id = c.transitionIds.get(ref);
              return id ? [sql`${id}::uuid`] : [];
            }),
          ],
          sql`, `,
        )}]::uuid[], NULL),
        ${c.runId}::uuid,
        ${JSON.stringify({
          kind: kindOf(op),
          op: op.op,
          reason: c.reason,
          resolution: op.op === 'resolve' ? op.resolution : null,
          explanation: op.explanation,
          facts: op.facts,
          observation: op.observation,
          settingsFingerprint: op.settingsFingerprint,
          transitionRefs: op.transitionRefs,
        })}::jsonb,
        ${caseId}::uuid, ${c.asOf}::timestamptz)`);
  }
}
