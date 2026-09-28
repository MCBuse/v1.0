import { publicCreditSnapshot } from '../../credit-assessment/scoring-client';
import {
  CREDIT_EVIDENCE_WINDOW_DAYS,
  CreditEvidenceService,
} from '../../credit-assessment/credit-evidence.service';
import type { CreditPublicResult } from '@repo/shared';
import { alignConfidenceWithEvidence } from '../../credit-assessment/credit-display';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.provider';
import * as schema from '../../database/schema';
import { MerchantService } from '../merchant.service';
import {
  assessmentModel,
  type AssessmentModel,
  type AssessmentResult,
} from './assessment-model';

const EVIDENCE_WINDOW_DAYS = CREDIT_EVIDENCE_WINDOW_DAYS;

export interface SavedAssessment {
  id: string;
  modelId: string;
  modelVersion: string;
  stage: string;
  score: number | null;
  credit?: CreditPublicResult;
  evidenceWindow: { from: string; to: string; days: number };
  passedRequirements: string[];
  missingRequirements: string[];
  reliability: AssessmentResult['reliability'];
  sourceCoverage: AssessmentResult['sourceCoverage'];
  limitations: string[];
  disclaimer: string;
  businessProfile: Record<string, unknown>;
  createdAt: string;
  actorUserId: string;
}

/**
 * Runs and stores assessments.
 *
 * Every run writes a new immutable row. Nothing is ever updated, so a package
 * that cites an assessment keeps citing exactly what the merchant saw, even
 * after their trading history has moved on.
 */
@Injectable()
export class MerchantAssessmentService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly merchants: MerchantService,
    private readonly creditEvidence: CreditEvidenceService,
  ) {}

  /** Runs the model and saves the result. */
  async run(
    userId: string,
    modelId?: string,
    idempotencyKey?: string,
  ): Promise<SavedAssessment> {
    const merchant = await this.merchants.requireMerchant(userId);
    const findReplay = async () => {
      if (!idempotencyKey) return null;
      const [row] = await this.db
        .select()
        .from(schema.merchantAssessments)
        .where(
          and(
            eq(schema.merchantAssessments.merchantId, merchant.merchantId),
            eq(schema.merchantAssessments.idempotencyKey, idempotencyKey),
          ),
        );
      if (row && row.modelId !== (modelId ?? 'readiness-rules-v1'))
        throw new ConflictException(
          'Assessment key already used with a different model',
        );
      return row ? this.present(row) : null;
    };
    const replay = await findReplay();
    if (replay) return replay;
    const profile = await this.merchants.getMe(userId);

    const evidenceTo = new Date();
    const evidenceFrom = new Date(
      evidenceTo.getTime() - EVIDENCE_WINDOW_DAYS * 86_400_000,
    );

    const readiness = await this.merchants.getReadiness(userId, {
      from: evidenceFrom,
      to: evidenceTo,
    });
    const creditAssessment = await this.creditEvidence.assess(
      merchant.merchantId,
      evidenceTo,
      evidenceFrom,
    );

    // Naming a model that does not exist is a caller mistake, not a server
    // fault, and must not be answered by quietly using a different model.
    let model: AssessmentModel;
    try {
      model = assessmentModel(modelId);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Unknown assessment model',
      );
    }
    const result = {
      ...model.assess({
        measurements: readiness.measured,
        evidenceFrom,
        evidenceTo,
        credit: creditAssessment.result,
      }),
      credit: creditAssessment.result,
    };

    const profileSnapshot = {
      businessName: profile.businessName,
      creditProfile: creditAssessment.input.profile,
      creditInputSnapshot: creditAssessment.input,
      timezone: profile.timezone,
      displayCurrency: profile.displayCurrency,
      consent: { active: readiness.measured.activeConsent },
      capturedAt: evidenceTo.toISOString(),
    };

    const [saved] = await this.db
      .insert(schema.merchantAssessments)
      .values({
        merchantId: merchant.merchantId,
        idempotencyKey: idempotencyKey ?? null,
        modelId: result.modelId,
        modelVersion: result.modelVersion,
        evidenceFrom,
        evidenceTo,
        stage: result.stage,
        result,
        profileSnapshot,
        actorUserId: userId,
      })
      .onConflictDoNothing()
      .returning();

    if (!saved) return (await findReplay())!;
    return this.present(saved);
  }

  async history(userId: string, limit = 25): Promise<SavedAssessment[]> {
    const merchant = await this.merchants.requireMerchant(userId);
    const rows = await this.db
      .select()
      .from(schema.merchantAssessments)
      .where(eq(schema.merchantAssessments.merchantId, merchant.merchantId))
      .orderBy(desc(schema.merchantAssessments.createdAt))
      .limit(limit);
    return rows.map((row) => this.present(row));
  }

  async latest(userId: string): Promise<SavedAssessment | null> {
    const [first] = await this.history(userId, 1);
    return first ?? null;
  }

  async require(
    userId: string,
    assessmentId: string,
  ): Promise<SavedAssessment> {
    const merchant = await this.merchants.requireMerchant(userId);
    const [row] = await this.db
      .select()
      .from(schema.merchantAssessments)
      .where(
        and(
          eq(schema.merchantAssessments.id, assessmentId),
          // Scoped to the merchant, so an id from elsewhere is simply absent.
          eq(schema.merchantAssessments.merchantId, merchant.merchantId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException('Assessment not found');
    return this.present(row);
  }

  /** Records which assessment a finance package reports. */
  async linkToPackage(packageId: string, assessmentId: string): Promise<void> {
    await this.db
      .insert(schema.merchantFinancePackageAssessments)
      .values({ packageId, assessmentId })
      .onConflictDoNothing();
  }

  async forPackage(packageId: string): Promise<SavedAssessment | null> {
    const [link] = await this.db
      .select()
      .from(schema.merchantFinancePackageAssessments)
      .where(eq(schema.merchantFinancePackageAssessments.packageId, packageId))
      .limit(1);
    if (!link) return null;

    const [row] = await this.db
      .select()
      .from(schema.merchantAssessments)
      .where(eq(schema.merchantAssessments.id, link.assessmentId))
      .limit(1);
    return row ? this.present(row) : null;
  }

  private present(
    row: typeof schema.merchantAssessments.$inferSelect,
  ): SavedAssessment {
    const result = row.result as AssessmentResult & {
      credit?: CreditPublicResult;
    };
    const days = Math.round(
      (row.evidenceTo.getTime() - row.evidenceFrom.getTime()) / 86_400_000,
    );
    return {
      id: row.id,
      modelId: row.modelId,
      modelVersion: row.modelVersion,
      stage: row.stage,
      score: result.score ?? null,
      // Data confidence is capped by the evidence checklist on every read, so
      // saved assessments and their PDFs tell one consistent story.
      ...(result.credit
        ? {
            credit: alignConfidenceWithEvidence(
              publicCreditSnapshot(result.credit),
              result.missingRequirements ?? [],
            ),
          }
        : {}),
      evidenceWindow: {
        from: row.evidenceFrom.toISOString(),
        to: row.evidenceTo.toISOString(),
        days,
      },
      passedRequirements: result.passedRequirements ?? [],
      missingRequirements: result.missingRequirements ?? [],
      reliability: result.reliability,
      sourceCoverage: result.sourceCoverage,
      limitations: result.limitations ?? [],
      disclaimer: result.disclaimer,
      businessProfile: row.profileSnapshot as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
      actorUserId: row.actorUserId,
    };
  }
}
