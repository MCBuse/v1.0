import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  CreditInputPreview,
  CreditProfile,
  CreditPublicResult,
} from '@repo/shared';
import { CREDIT_MODEL_VERSION } from './credit-contract';
import { DRIZZLE } from '../database/database.provider';
import * as s from '../database/schema';
import {
  merchantCalendarDaySpan,
  merchantLocalDateKey,
  calculateCaptureQualityPercent,
} from '../data-capture/merchant-summary';
import {
  ScoringClient,
  publicScoringResult,
  type ScoringValues,
} from './scoring-client';
import { euroMajor, validateCreditProfile } from './credit-profile';
export const PILOT_CONSENT = 'credit_pilot_assessment';
/** Days of activity every merchant assessment reads, shared by preview and run. */
export const CREDIT_EVIDENCE_WINDOW_DAYS = 90;
/** Inputs calculated from recorded sales: verified digital payments plus merchant-recorded cash. */
const SALES_INPUTS: ReadonlySet<string> = new Set([
  'active_day_ratio',
  'finalized_payments',
  'avg_txn_value_eur',
  'cv_txn_value',
  'verified_sales_eur',
  'revenue_trend_slope_pct',
]);
/** Model inputs the merchant declares; everything else is derived from activity. */
const DECLARED_INPUTS: ReadonlySet<string> = new Set([
  'merchant_type',
  'commencement_date',
  'existing_debt_to_sales',
  'loan_amount_eur',
  'loan_term_months',
  'inventory_value_eur',
  'collateral_value_eur',
  'business_debts_eur',
  'business_assets_eur',
  'owner_personal_assets_eur',
  'owner_personal_debts_eur',
  'external_bureau_score',
  'external_bureau_report',
]);
export const PILOT_CONSENT_VERSION = '2026-09-credit-pilot-v1';
export function trend(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean <= 0) return null;
  const x = (values.length - 1) / 2;
  let num = 0,
    den = 0;
  values.forEach((y, i) => {
    num += (i - x) * (y - mean);
    den += (i - x) ** 2;
  });
  return (num / den / mean) * 100;
}
@Injectable()
export class CreditEvidenceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof s>,
    private readonly scoring: ScoringClient,
  ) {}
  async profile(merchantId: string): Promise<CreditProfile> {
    const [r] = await this.db
      .select()
      .from(s.merchantCreditProfiles)
      .where(eq(s.merchantCreditProfiles.merchantId, merchantId));
    return r?.data ?? {};
  }
  async saveProfile(merchantId: string, data: Record<string, unknown>) {
    const checked = validateCreditProfile(data);
    return this.db.transaction(async (tx) => {
      // Serialize partial updates for the same merchant.
      await tx
        .select({ id: s.merchants.id })
        .from(s.merchants)
        .where(eq(s.merchants.id, merchantId))
        .for('update');
      const [old] = await tx
        .select()
        .from(s.merchantCreditProfiles)
        .where(eq(s.merchantCreditProfiles.merchantId, merchantId));
      const merged = { ...(old?.data ?? {}), ...checked };
      await tx
        .insert(s.merchantCreditProfiles)
        .values({ merchantId, data: merged })
        .onConflictDoUpdate({
          target: s.merchantCreditProfiles.merchantId,
          set: { data: merged, updatedAt: new Date() },
        });
      return merged;
    });
  }
  async consent(merchantId: string, purpose = PILOT_CONSENT) {
    const [r] = await this.db
      .select()
      .from(s.merchantConsentRecords)
      .where(
        and(
          eq(s.merchantConsentRecords.merchantId, merchantId),
          eq(s.merchantConsentRecords.purpose, purpose),
        ),
      )
      .orderBy(
        desc(s.merchantConsentRecords.recordedAt),
        desc(s.merchantConsentRecords.id),
      )
      .limit(1);
    return {
      active:
        r?.action === 'granted' &&
        (purpose !== PILOT_CONSENT || r.version === PILOT_CONSENT_VERSION),
      purpose,
      version: r?.version ?? PILOT_CONSENT_VERSION,
      recordedAt: r?.recordedAt.toISOString() ?? null,
    };
  }
  async setConsent(merchantId: string, userId: string, active: boolean) {
    await this.db.insert(s.merchantConsentRecords).values({
      merchantId,
      actorUserId: userId,
      purpose: PILOT_CONSENT,
      version: PILOT_CONSENT_VERSION,
      action: active ? 'granted' : 'revoked',
    });
    return this.consent(merchantId);
  }
  async build(
    merchantId: string,
    to = new Date(),
    from = new Date(to.getTime() - 90 * 86400000),
  ) {
    const [merchant] = await this.db
      .select()
      .from(s.merchants)
      .where(
        and(eq(s.merchants.id, merchantId), eq(s.merchants.isActive, true)),
      );
    if (!merchant) throw new NotFoundException('Merchant not found');
    const [profile, allTransactions, attempts, exceptions, cash, imports] =
      await Promise.all([
        this.profile(merchantId),
        this.db
          .select()
          .from(s.merchantTransactions)
          .where(
            and(
              eq(s.merchantTransactions.merchantId, merchantId),
              eq(s.merchantTransactions.status, 'finalized'),
              gte(s.merchantTransactions.occurredAt, from),
              lte(s.merchantTransactions.occurredAt, to),
            ),
          )
          .orderBy(s.merchantTransactions.occurredAt),
        this.db
          .select({
            id: s.merchantPaymentAttempts.id,
            status: s.merchantPaymentAttempts.status,
          })
          .from(s.merchantPaymentAttempts)
          .innerJoin(
            s.paymentRequests,
            eq(
              s.paymentRequests.id,
              s.merchantPaymentAttempts.paymentRequestId,
            ),
          )
          .where(
            and(
              eq(s.paymentRequests.merchantId, merchantId),
              gte(s.merchantPaymentAttempts.claimedAt, from),
              lte(s.merchantPaymentAttempts.claimedAt, to),
            ),
          ),
        this.db
          .select()
          .from(s.merchantCaptureExceptions)
          .where(
            and(
              eq(s.merchantCaptureExceptions.merchantId, merchantId),
              gte(s.merchantCaptureExceptions.createdAt, from),
              lte(s.merchantCaptureExceptions.createdAt, to),
            ),
          ),
        this.db
          .select({
            id: s.merchantCashSales.id,
            amountMinor: s.merchantCashSales.amountMinor,
            occurredAt: s.merchantCashSales.occurredAt,
          })
          .from(s.merchantCashSales)
          .where(
            and(
              eq(s.merchantCashSales.merchantId, merchantId),
              eq(s.merchantCashSales.status, 'recorded'),
              gte(s.merchantCashSales.occurredAt, from),
              lte(s.merchantCashSales.occurredAt, to),
            ),
          ),
        this.db
          .select({ id: s.merchantImportBatches.id })
          .from(s.merchantImportBatches)
          .where(
            and(
              eq(s.merchantImportBatches.merchantId, merchantId),
              eq(s.merchantImportBatches.status, 'committed'),
              gte(s.merchantImportBatches.committedAt, from),
              lte(s.merchantImportBatches.committedAt, to),
            ),
          ),
      ]);
    // Digital sales: live EUR MCBuse payments only; test and devnet payments
    // are not real sales. They also drive the payment-reliability inputs.
    const tx = allTransactions.filter(
      (t) => t.evidenceEnvironment === 'live' && t.displayCurrency === 'EUR',
    );
    // Sales inputs combine those payments with merchant-recorded cash sales
    // (decision 2026-09-26). Cash stays labelled as merchant-recorded in the
    // provenance; voided cash sales are already excluded by the query.
    const recordedSales = [
      ...tx.map((t) => ({
        occurredAt: t.occurredAt,
        amountMinor: t.displayAmountMinor,
      })),
      ...cash.map((c) => ({
        occurredAt: c.occurredAt,
        amountMinor: c.amountMinor,
      })),
    ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const amounts = recordedSales.map((t) => euroMajor(t.amountMinor));
    const safe = amounts.every((v) => v !== null);
    const nums = amounts.filter((v): v is number => v !== null);
    const totalMinor = recordedSales.reduce((a, t) => a + t.amountMinor, 0n);
    const sales = safe ? euroMajor(totalMinor) : null;
    const mean =
      sales !== null && recordedSales.length
        ? sales / recordedSales.length
        : null;
    const firstSale = recordedSales[0];
    const observed = firstSale
      ? merchantCalendarDaySpan(firstSale.occurredAt, to, merchant.timezone)
      : 0;
    const active = new Set(
      recordedSales.map((t) =>
        merchantLocalDateKey(t.occurredAt, merchant.timezone),
      ),
    ).size;
    const daily: Record<string, number> = {};
    for (const t of recordedSales) {
      const k = merchantLocalDateKey(t.occurredAt, merchant.timezone);
      daily[k] = (daily[k] ?? 0) + (euroMajor(t.amountMinor) ?? 0);
    }
    const dailyValues: number[] = [];
    if (firstSale) {
      const first = Date.parse(
        merchantLocalDateKey(firstSale.occurredAt, merchant.timezone),
      );
      const end = Date.parse(merchantLocalDateKey(to, merchant.timezone));
      for (let d = first; d <= end; d += 86400000)
        dailyValues.push(daily[new Date(d).toISOString().slice(0, 10)] ?? 0);
    }
    const mixed = allTransactions.length !== tx.length;
    const crit = exceptions.filter(
      (e) => e.severity === 'critical' && e.status === 'open',
    ).length;
    const values: ScoringValues = {
      merchant_type: profile.merchantType ?? null,
      commencement_date: profile.commencementDate ?? null,
      active_day_ratio: observed ? (active / observed) * 100 : null,
      finalized_payments: recordedSales.length,
      avg_txn_value_eur: mean,
      cv_txn_value:
        mean && safe
          ? Math.sqrt(
              nums.reduce((a, n) => a + (n - mean) ** 2, 0) / nums.length,
            ) / mean
          : null,
      verified_sales_eur: sales,
      // Attempts lack environment classification. Mixed histories cannot support live-only reliability ratios.
      exception_rate:
        !mixed && attempts.length
          ? (new Set(exceptions.map((e) => e.paymentRequestId ?? e.id)).size /
              attempts.length) *
            100
          : null,
      critical_unresolved_ratio:
        !mixed && attempts.length ? (crit / attempts.length) * 100 : null,
      retry_success_rate: null,
      capture_quality:
        !mixed && tx.length
          ? calculateCaptureQualityPercent(
              tx.length,
              exceptions.map((e) => e.reasonCode),
            )
          : null,
      finality:
        !mixed && attempts.length
          ? (attempts.filter((a) => a.status === 'finalized').length /
              attempts.length) *
            100
          : null,
      capture_quality_trend: null,
      revenue_trend_slope_pct: safe ? trend(dailyValues) : null,
      estimated_margin_pct: null,
      existing_debt_to_sales:
        sales && euroMajor(profile.existingDebtMinor) !== null
          ? (euroMajor(profile.existingDebtMinor)! / sales) * 100
          : null,
      loan_amount_eur: euroMajor(profile.loanAmountMinor),
      loan_term_months: profile.loanTermMonths ?? null,
      inventory_value_eur: euroMajor(profile.inventoryValueMinor),
      collateral_value_eur: euroMajor(profile.collateralValueMinor),
      business_debts_eur: euroMajor(profile.businessDebtsMinor),
      business_assets_eur: euroMajor(profile.businessAssetsMinor),
      owner_personal_assets_eur: euroMajor(profile.ownerPersonalAssetsMinor),
      owner_personal_debts_eur: euroMajor(profile.ownerPersonalDebtsMinor),
      external_bureau_score: profile.externalBureauScore ?? null,
      external_bureau_report: profile.externalBureauReport ?? null,
    };
    for (const key of ['exception_rate', 'critical_unresolved_ratio'])
      if (typeof values[key] === 'number' && values[key] > 100)
        values[key] = null;
    const declared = DECLARED_INPUTS;
    const salesProvenance =
      tx.length && cash.length
        ? 'mcbuse_live_payments_and_merchant_cash'
        : cash.length
          ? 'merchant_recorded_cash'
          : 'mcbuse_live_payments';
    const provenance = Object.fromEntries(
      Object.keys(values).map((k) => [
        k,
        values[k] === null
          ? 'unavailable'
          : declared.has(k)
            ? 'merchant_declared'
            : SALES_INPUTS.has(k)
              ? salesProvenance
              : k.includes('quality') ||
                  k === 'finality' ||
                  k.includes('exception') ||
                  k.includes('critical')
                ? 'mcbuse_processing_records'
                : 'mcbuse_live_payments',
      ]),
    );
    const missingReasons: Record<string, string> = {
      estimated_margin_pct: 'Verified supplier spending is not connected.',
      retry_success_rate: 'A complete retry event history is not recorded.',
      capture_quality_trend:
        'Historical capture-quality snapshots are not recorded.',
    };
    for (const [k, v] of Object.entries(values))
      if (v === null && !missingReasons[k])
        missingReasons[k] = declared.has(k)
          ? 'Not provided in the business credit profile.'
          : SALES_INPUTS.has(k)
            ? 'Not enough recorded sales in the evidence period.'
            : 'Insufficient compatible verified records in the evidence period.';
    const integritySummary = [
      `${tx.length} live verified payments and ${cash.length} merchant-recorded cash sales used for sales inputs; ${allTransactions.length - tx.length} test, other-environment or non-EUR payments excluded.`,
      `${active} active days across ${observed} observed days.`,
      `${crit} unresolved critical exceptions raised in this period; ${exceptions.filter((e) => e.status === 'resolved').length} resolved exceptions.`,
      `Cash sales are merchant-recorded, not independently verified. ${imports.length} imported batches are disclosed separately and excluded from sales inputs.`,
    ];
    return {
      values,
      asOfDate: to.toISOString().slice(0, 10),
      provenance,
      missingReasons,
      integritySummary,
      profile,
      evidenceWindow: { from: from.toISOString(), to: to.toISOString() },
    };
  }
  /**
   * The activity-derived inputs a merchant assessment would use right now.
   * Read-only: nothing is saved and the scoring service is not called, so it
   * needs no assessment consent. Declared inputs are omitted; the merchant
   * edits those in the Additional Information form.
   */
  async preview(
    merchantId: string,
    to = new Date(),
  ): Promise<CreditInputPreview> {
    const from = new Date(
      to.getTime() - CREDIT_EVIDENCE_WINDOW_DAYS * 86_400_000,
    );
    const input = await this.build(merchantId, to, from);
    return {
      asOfDate: input.asOfDate,
      evidenceWindow: input.evidenceWindow,
      inputs: Object.keys(input.values)
        .filter((key) => !DECLARED_INPUTS.has(key))
        .map((key) => {
          const value = input.values[key] ?? null;
          return {
            key,
            value:
              typeof value === 'number' || typeof value === 'string'
                ? value
                : null,
            provenance: input.provenance[key] ?? 'unavailable',
            missingReason:
              value === null ? (input.missingReasons[key] ?? null) : null,
          };
        }),
      integritySummary: input.integritySummary,
    };
  }
  async assess(merchantId: string, to: Date, from: Date, experimental = false) {
    const input = await this.build(merchantId, to, from);
    const consent = await this.consent(
      merchantId,
      experimental ? PILOT_CONSENT : 'evidence_assessment',
    );
    const response = consent.active
      ? await this.scoring.evaluate(
          input.values,
          input.asOfDate,
          // The consent purpose above stays tied to `experimental`; asking the
          // model for its credit score does not change what was consented to.
          experimental || this.scoring.creditScoreForMerchants(),
        )
      : null;
    const result: CreditPublicResult = {
      status: !consent.active
        ? 'consent_required'
        : response
          ? 'ready'
          : 'temporarily_unavailable',
      modelVersion: CREDIT_MODEL_VERSION,
      businessAgeMonths: null,
      unavailableFields: Object.keys(input.missingReasons),
      financialProfile: null,
      creditScore: null,
      profileConfidence: null,
      ...(response ? publicScoringResult(response) : {}),
      missingReasons: input.missingReasons,
      indicators: input.values,
      provenance: input.provenance,
      integritySummary: input.integritySummary,
    };
    return {
      input,
      result,
      experimentalCredit: response?.experimentalCredit ?? null,
    };
  }
}
