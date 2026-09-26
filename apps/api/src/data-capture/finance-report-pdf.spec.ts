import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  renderFinanceReport,
  type FinanceReportSnapshot,
} from './finance-report-pdf';

const money = (minor: number) => ({ minor: String(minor), currency: 'EUR' });
const days = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 7, 28 + i));
  return {
    start: d.toISOString().slice(0, 10),
    amountMinor: String(i % 6 === 0 ? 0 : 3000 + ((i * 1370) % 9000)),
    paymentCount: i % 6 === 0 ? 0 : 5 + (i % 7),
  };
});
const products = [
  ['Cappuccino', 72, 24480],
  ['Ham and cheese sandwich', 32, 22080],
  ['Flat white', 61, 21960],
  ['Sourdough loaf', 22, 14300],
  ['Butter croissant', 51, 14280],
  ['Espresso', 58, 12760],
  ['Pain au chocolat', 37, 11470],
  ['Fresh orange juice', 22, 9240],
  ['Banana bread slice', 24, 8400],
  ['Black tea', 27, 6750],
  ['Sparkling water', 18, 3600],
] as const;

function snapshot(scored: boolean): FinanceReportSnapshot {
  const missingReasons: Record<string, string> = scored
    ? { estimated_margin_pct: 'Verified supplier spending is not connected.' }
    : {
        estimated_margin_pct: 'Verified supplier spending is not connected.',
        retry_success_rate: 'A complete retry event history is not recorded.',
        capture_quality:
          'Insufficient compatible verified records in the evidence period.',
        finality:
          'Insufficient compatible verified records in the evidence period.',
        loan_amount_eur: 'Not provided in the business credit profile.',
        collateral_value_eur: 'Not provided in the business credit profile.',
        merchant_type: 'Not provided in the business credit profile.',
        commencement_date: 'Not provided in the business credit profile.',
      };
  const indicators: Record<string, number | string | null> = {
    active_day_ratio: 83.3,
    finalized_payments: 609,
    avg_txn_value_eur: 7.88,
    cv_txn_value: 0.42,
    verified_sales_eur: 4796.7,
    revenue_trend_slope_pct: 2.4,
    loan_amount_eur: scored ? 5000 : null,
    merchant_type: scored ? 'kiosk' : null,
  };
  const provenance: Record<string, string> = {
    active_day_ratio: 'merchant_recorded_cash',
    finalized_payments: 'merchant_recorded_cash',
    avg_txn_value_eur: 'merchant_recorded_cash',
    cv_txn_value: 'merchant_recorded_cash',
    verified_sales_eur: 'merchant_recorded_cash',
    revenue_trend_slope_pct: 'merchant_recorded_cash',
    loan_amount_eur: scored ? 'merchant_declared' : 'unavailable',
    merchant_type: scored ? 'merchant_declared' : 'unavailable',
  };
  for (const k of Object.keys(missingReasons)) provenance[k] = 'unavailable';
  return {
    businessName: "Fred's Kiosk",
    generatedAt: '2026-09-26T21:03:22.239Z',
    assessment: {
      id: 'e74c61b2-b04d-42de-99a0-a94095929c37',
      modelVersion: 'george-html-2026.09.1',
      stage: scored ? 'financial_profile_available' : 'missing_model_inputs',
      createdAt: '2026-09-26T20:02:20.412Z',
      evidenceWindow: {
        from: '2026-06-28T20:02:20.364Z',
        to: '2026-09-26T20:02:20.364Z',
        days: 90,
      },
      passedRequirements: [
        'Evidence consent is active',
        'No unresolved critical exception',
        'At least 30 observed days',
      ],
      missingRequirements: [
        'At least 10 active days',
        'At least 25 finalized payments',
        'George model input: estimated margin pct',
      ],
      reliability: {
        observedDays: 90,
        activeDays: 4,
        finalizedPayments: 3,
        captureQualityPercent: 100,
        finalityPercent: 100,
      },
      limitations: [
        "George's financial profile uses available business evidence. Missing required inputs are not estimated.",
      ],
      businessProfile: {
        businessName: "Fred's Kiosk",
        timezone: 'Europe/Berlin',
        creditProfile: scored
          ? {
              loanAmountMinor: '500000',
              merchantType: 'kiosk',
              loanTermMonths: 12,
            }
          : {},
      },
      credit: {
        status: 'ready',
        modelVersion: 'george-html-2026.09.1',
        financialProfile: scored ? { score: 64.25 } : null,
        profileConfidence: scored
          ? { label: 'Medium', fieldsFilled: 20, fieldsTotal: 26 }
          : null,
        missingReasons,
        indicators,
        provenance,
        integritySummary: [
          '3 live verified payments and 606 merchant-recorded cash sales used for sales inputs; 0 test, other-environment or non-EUR payments excluded.',
          '75 active days across 90 observed days.',
        ],
      },
    },
    analytics: {
      period: {
        from: '2026-08-27T21:03:22.239Z',
        to: '2026-09-26T21:03:22.239Z',
        timezone: 'Europe/Berlin',
      },
      totalRecordedSales: money(173720),
      saleCount: 225,
      averageSale: money(772),
      digitalSales: money(1450),
      cashSales: money(172270),
      sourceCoverage: {
        mcbuse_payment: 3,
        merchant_cash: 222,
        external_import: 0,
      },
      dailyTrend: days,
    },
    productMetrics: products.map(([name, quantitySold, minor]) => ({
      name,
      quantitySold,
      revenue: money(minor),
    })),
    reconciliation: { coverage: false, items: [] },
    exportIntegrity: {
      detailRowCount: 225,
      detailAmountMinor: '173720',
      reconciles: true,
    },
    limitations: [
      'Evidence readiness is not a credit score, lending decision, approval or denial.',
      'Merchant-recorded cash and imported settlement records retain their source labels.',
    ],
  };
}

describe('renderFinanceReport', () => {
  it.each([
    ['no-score', false],
    ['scored', true],
  ])('renders a multi-page A4 report (%s)', async (name, scored) => {
    const pdf = await renderFinanceReport(
      snapshot(scored),
      'd862cdd4-25f8-4b93-9ec5-45ccbee6daa4',
    );
    if (process.env.REPORT_PDF_OUT)
      writeFileSync(
        join(process.env.REPORT_PDF_OUT, `report-${name}.pdf`),
        pdf,
      );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const pages = pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(pages).toBeLessThanOrEqual(4);
  });

  it('renders a legacy snapshot without an assessment', async () => {
    const s = snapshot(false);
    s.assessment = null;
    const pdf = await renderFinanceReport(
      s,
      '00000000-0000-4000-8000-000000000000',
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
