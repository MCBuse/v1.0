import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { CreditPublicResult } from '@repo/shared';
import { CREDIT_MODEL_VERSION } from './credit-contract';
import { DRIZZLE } from '../database/database.provider';
import * as s from '../database/schema';
import { CreditEvidenceService } from './credit-evidence.service';
import { CreditAccessService } from './credit-access.service';
import {
  ScoringClient,
  publicScoringResult,
  type ScoringValues,
} from './scoring-client';
// Fixed examples exercise the full synthetic reference without accepting fabricated live evidence.
export const SYNTHETIC_EXAMPLES: Record<string, ScoringValues> = {
  complete: {
    merchant_type: 'grocer',
    commencement_date: '2020-01-15',
    active_day_ratio: 84.65,
    finalized_payments: 236,
    avg_txn_value_eur: 4.75,
    cv_txn_value: 0.369,
    verified_sales_eur: 1121,
    exception_rate: 9.36,
    critical_unresolved_ratio: 8.06,
    retry_success_rate: 76.35,
    capture_quality: 100,
    finality: 96,
    capture_quality_trend: 0.4,
    revenue_trend_slope_pct: -1.44,
    estimated_margin_pct: 33.03,
    existing_debt_to_sales: 28.7,
    loan_amount_eur: 400,
    loan_term_months: 6,
  },
};
SYNTHETIC_EXAMPLES['missing-margin'] = {
  ...SYNTHETIC_EXAMPLES.complete,
  estimated_margin_pct: null,
};
SYNTHETIC_EXAMPLES['optional-missing'] = {
  ...SYNTHETIC_EXAMPLES.complete,
  existing_debt_to_sales: null,
  loan_amount_eur: null,
  loan_term_months: null,
};
@Injectable()
export class StaffCreditService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof s>,
    private readonly evidence: CreditEvidenceService,
    private readonly scoring: ScoringClient,
    private readonly access: CreditAccessService,
  ) {}
  async merchants(userId: string) {
    await this.access.requireStaff(userId);
    const rows = await this.db
      .select({ id: s.merchants.id, name: s.merchants.businessName })
      .from(s.creditPilotEnrollments)
      .innerJoin(
        s.merchants,
        eq(s.merchants.id, s.creditPilotEnrollments.merchantId),
      )
      .where(
        and(
          eq(s.creditPilotEnrollments.active, true),
          eq(s.merchants.isActive, true),
        ),
      );
    const allowed = [] as typeof rows;
    for (const row of rows)
      if ((await this.evidence.consent(row.id)).active) allowed.push(row);
    await this.access.audit(userId, 'credit.pilot.list');
    return {
      merchants: allowed,
      syntheticExamples: Object.keys(SYNTHETIC_EXAMPLES),
    };
  }
  async run(
    userId: string,
    request: { merchantId?: string; exampleId?: string },
    key: string,
  ) {
    await this.access.requireStaff(userId);
    if (!key || key.length > 128 || !/^[-\w.:]+$/.test(key))
      throw new BadRequestException('A valid Idempotency-Key is required');
    if (Boolean(request.merchantId) === Boolean(request.exampleId))
      throw new BadRequestException(
        'Choose exactly one merchant or synthetic example',
      );
    if (request.merchantId) await this.access.requirePilot(request.merchantId);
    if (request.exampleId && !SYNTHETIC_EXAMPLES[request.exampleId])
      throw new BadRequestException('Unknown synthetic example');
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          merchantId: request.merchantId ?? null,
          exampleId: request.exampleId ?? null,
          model: CREDIT_MODEL_VERSION,
        }),
      )
      .digest('hex');
    const replay = async () => {
      const [r] = await this.db
        .select()
        .from(s.staffCreditAssessments)
        .where(
          and(
            eq(s.staffCreditAssessments.actorUserId, userId),
            eq(s.staffCreditAssessments.idempotencyKey, key),
          ),
        );
      if (r && r.inputFingerprint !== fingerprint)
        throw new ConflictException(
          'Assessment key already used for a different request',
        );
      return r;
    };
    const previous = await replay();
    if (previous) {
      await this.access.audit(userId, 'credit.assessment.replay', previous.id);
      return previous;
    }
    const to = new Date(),
      from = new Date(to.getTime() - 90 * 86400000);
    let input: unknown, result: unknown;
    if (request.merchantId) {
      const assessed = await this.evidence.assess(
        request.merchantId,
        to,
        from,
        true,
      );
      if (assessed.result.status === 'temporarily_unavailable')
        throw new ServiceUnavailableException(
          'Scoring service temporarily unavailable',
        );
      await this.access.requirePilot(request.merchantId);
      input = assessed.input;
      result = {
        ...assessed.result,
        experimentalCredit: assessed.experimentalCredit,
      };
    } else {
      const values = SYNTHETIC_EXAMPLES[request.exampleId!];
      const asOfDate = '2026-09-20';
      const scored = await this.scoring.evaluate(values, asOfDate, true);
      if (!scored)
        throw new ServiceUnavailableException(
          'Scoring service temporarily unavailable',
        );
      const provenance = Object.fromEntries(
        Object.keys(values).map((k) => [k, 'synthetic_demonstration']),
      );
      input = { values, asOfDate, provenance, exampleId: request.exampleId };
      result = {
        ...publicScoringResult(scored),
        status: 'ready',
        missingReasons: Object.fromEntries(
          scored.unavailableFields.map((k) => [
            k,
            'Deliberately missing in this synthetic example.',
          ]),
        ),
        indicators: values,
        provenance,
        integritySummary: [
          'Synthetic demonstration only; not merchant performance.',
        ],
        experimentalCredit: scored.experimentalCredit ?? null,
      } satisfies CreditPublicResult & { experimentalCredit: unknown };
    }
    const row = await this.db.transaction(async (tx) => {
      const [saved] = await tx
        .insert(s.staffCreditAssessments)
        .values({
          merchantId: request.merchantId ?? null,
          actorUserId: userId,
          synthetic: !request.merchantId,
          modelVersion: CREDIT_MODEL_VERSION,
          input,
          result,
          idempotencyKey: key,
          inputFingerprint: fingerprint,
        })
        .onConflictDoNothing()
        .returning();
      if (saved)
        await tx.insert(s.auditLogs).values({
          userId,
          action: 'credit.assessment.run',
          entityType: 'credit_assessment',
          entityId: saved.id,
        });
      return saved;
    });
    return row ?? (await replay());
  }
  async history(userId: string, merchantId?: string) {
    await this.access.requireStaff(userId);
    if (merchantId) await this.access.requirePilot(merchantId);
    // Unfiltered history contains synthetic examples only, never all merchants.
    const rows = await this.db
      .select()
      .from(s.staffCreditAssessments)
      .where(
        merchantId
          ? eq(s.staffCreditAssessments.merchantId, merchantId)
          : eq(s.staffCreditAssessments.synthetic, true),
      )
      .orderBy(desc(s.staffCreditAssessments.createdAt))
      .limit(50);
    await this.access.audit(userId, 'credit.assessment.history', merchantId);
    return { assessments: rows };
  }
  async detail(userId: string, id: string) {
    await this.access.requireStaff(userId);
    const [row] = await this.db
      .select()
      .from(s.staffCreditAssessments)
      .where(eq(s.staffCreditAssessments.id, id));
    if (!row) throw new NotFoundException('Assessment not found');
    if (row.merchantId) await this.access.requirePilot(row.merchantId);
    await this.access.audit(userId, 'credit.assessment.read', id);
    return row;
  }
}
