import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CreditPublicResult,
  CreditScore,
  ExperimentalCredit,
} from '@repo/shared';
import { CREDIT_MODEL_VERSION } from './credit-contract';
export type ScoringValues = Record<string, string | number | null>;
export type ScoringResponse = Pick<
  CreditPublicResult,
  | 'modelVersion'
  | 'artifactSha256'
  | 'businessAgeMonths'
  | 'unavailableFields'
  | 'financialProfile'
  | 'profileConfidence'
> & { experimentalCredit?: ExperimentalCredit | null };
/**
 * Score and grade only: default probability, statistical score and overlay
 * points stay out of anything a merchant or lender sees.
 */
function creditScoreOf(r: {
  creditScore?: CreditScore | null;
  experimentalCredit?: ExperimentalCredit | null;
}): CreditScore | null {
  const score = r.experimentalCredit?.creditScore ?? r.creditScore?.score;
  const grade = r.experimentalCredit?.creditGrade ?? r.creditScore?.grade;
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  if (typeof grade !== 'string' || !grade) return null;
  return { score: Math.round(score), grade, scale: '300-850' };
}
/** Construct an allowlisted public projection; never spread a remote result. */
export function publicScoringResult(
  r: ScoringResponse & { creditScore?: CreditScore | null },
): Omit<ScoringResponse, 'experimentalCredit'> & {
  creditScore: CreditScore | null;
} {
  return {
    creditScore: creditScoreOf(r),
    modelVersion: r.modelVersion,
    artifactSha256: r.artifactSha256,
    businessAgeMonths: r.businessAgeMonths,
    unavailableFields: r.unavailableFields,
    financialProfile: r.financialProfile
      ? {
          score: r.financialProfile.score,
          scale: '0-100',
          breakdown: Object.fromEntries(
            Object.entries(r.financialProfile.breakdown).filter(
              ([key, v]) =>
                [
                  'active_day_ratio',
                  'finalized_payments',
                  'cv_txn_value',
                  'verified_sales_eur',
                  'business_age_months',
                  'revenue_trend_slope_pct',
                  'existing_debt_to_sales',
                  'estimated_margin_pct',
                ].includes(key) &&
                typeof v === 'number' &&
                Number.isFinite(v),
            ),
          ),
        }
      : null,
    profileConfidence: r.profileConfidence
      ? {
          label: r.profileConfidence.label,
          confidenceScore: r.profileConfidence.confidenceScore,
          coveragePct: r.profileConfidence.coveragePct,
          dataReliabilityQualityPct:
            r.profileConfidence.dataReliabilityQualityPct,
          fieldsFilled: r.profileConfidence.fieldsFilled,
          fieldsTotal: r.profileConfidence.fieldsTotal,
        }
      : null,
  };
}
@Injectable()
export class ScoringClient {
  private readonly logger = new Logger(ScoringClient.name);
  constructor(private readonly config: ConfigService) {}
  private identityToken: {
    audience: string;
    token: string;
    until: number;
  } | null = null;
  private async identityHeaders(): Promise<Record<string, string>> {
    const audience = this.config.get<string>('CREDIT_SCORING_AUDIENCE');
    if (!audience) return {};
    if (
      !this.identityToken ||
      this.identityToken.audience !== audience ||
      this.identityToken.until < Date.now()
    ) {
      const response = await fetch(
        `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}&format=full`,
        {
          headers: { 'Metadata-Flavor': 'Google' },
          signal: AbortSignal.timeout(2000),
          redirect: 'error',
        },
      );
      if (!response.ok) throw new Error('Service identity unavailable');
      const token = await response.text();
      if (!/^[A-Za-z0-9_.-]+$/.test(token))
        throw new Error('Invalid service identity');
      this.identityToken = {
        audience,
        token,
        until: Date.now() + 45 * 60 * 1000,
      };
    }
    return {
      'X-Serverless-Authorization': `Bearer ${this.identityToken.token}`,
    };
  }
  private async request(path: string, body?: unknown): Promise<unknown> {
    const url = this.config.get<string>('CREDIT_SCORING_URL');
    const token = this.config.get<string>('CREDIT_SCORING_TOKEN');
    if (!url || !token || token.length < 32)
      throw new Error('Scoring service is not configured');
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' &&
      !(
        parsed.protocol === 'http:' &&
        ['localhost', '127.0.0.1', 'credit-scoring'].includes(parsed.hostname)
      )
    )
      throw new Error('Scoring service requires HTTPS');
    const response = await fetch(`${url.replace(/\/$/, '')}${path}`, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(await this.identityHeaders()),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error('Scoring service unavailable');
    return response.json();
  }
  /** Merchant runs include the credit score unless CREDIT_SCORE_FOR_MERCHANTS=false. */
  creditScoreForMerchants(): boolean {
    return (
      this.config
        .get<string>('CREDIT_SCORE_FOR_MERCHANTS')
        ?.trim()
        .toLowerCase() !== 'false'
    );
  }
  metadata() {
    return this.request('/v1/model/metadata');
  }
  async evaluate(
    values: ScoringValues,
    asOfDate: string,
    experimental = false,
  ): Promise<ScoringResponse | null> {
    const started = Date.now();
    try {
      const r = (await this.request('/v1/evaluate', {
        values,
        asOfDate,
        experimental,
        modelVersion: CREDIT_MODEL_VERSION,
      })) as ScoringResponse;
      if (
        r.modelVersion !== CREDIT_MODEL_VERSION ||
        !/^[a-f0-9]{64}$/.test(r.artifactSha256 ?? '') ||
        !Array.isArray(r.unavailableFields) ||
        r.unavailableFields.some((x) => typeof x !== 'string') ||
        !r.profileConfidence ||
        !Number.isFinite(r.profileConfidence.confidenceScore) ||
        (r.financialProfile !== null &&
          (!r.financialProfile || !Number.isFinite(r.financialProfile.score)))
      )
        throw new Error('Invalid model response');
      this.logger.log({
        event: 'credit.scoring',
        status: 'ok',
        modelVersion: CREDIT_MODEL_VERSION,
        latencyMs: Date.now() - started,
      });
      return experimental ? r : publicScoringResult(r);
    } catch {
      this.logger.warn({
        event: 'credit.scoring',
        status: 'unavailable',
        modelVersion: CREDIT_MODEL_VERSION,
        latencyMs: Date.now() - started,
      });
      return null;
    }
  }
}

/** Public history/exports repeat the allowlist at the persistence boundary. */
export function publicCreditSnapshot(
  r: CreditPublicResult,
): CreditPublicResult {
  const fields = new Set([
    'merchant_type',
    'commencement_date',
    'active_day_ratio',
    'finalized_payments',
    'avg_txn_value_eur',
    'cv_txn_value',
    'verified_sales_eur',
    'exception_rate',
    'critical_unresolved_ratio',
    'retry_success_rate',
    'capture_quality',
    'finality',
    'capture_quality_trend',
    'revenue_trend_slope_pct',
    'estimated_margin_pct',
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
    'business_age_months',
  ]);
  const keep = <T>(value: Record<string, T>) =>
    Object.fromEntries(
      Object.entries(value).filter(([key]) => fields.has(key)),
    );
  return {
    status: r.status,
    ...publicScoringResult(r),
    missingReasons: keep(r.missingReasons),
    indicators: keep(r.indicators),
    provenance: keep(r.provenance),
    integritySummary: r.integritySummary,
  };
}
