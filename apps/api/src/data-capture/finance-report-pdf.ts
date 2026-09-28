import PDFDocument from 'pdfkit';
import {
  CREDIT_GRADE_BANDS,
  CREDIT_INPUT_LABELS,
  CREDIT_STAGE_LABELS,
  MERCHANT_CATEGORY_LABELS,
  missingInputKind,
  type MissingInputKind,
} from '../credit-assessment/credit-labels';
import { financialProfileBand } from '../credit-assessment/credit-display';

/**
 * The financial evidence PDF: written for a person at a lender, not a parser.
 *
 * Page one answers "who, which period, is there a score, and what does the
 * activity look like"; later pages carry the assessment detail, the business's
 * declarations and how the report was prepared. Every figure keeps its source
 * (verified MCBuse payment, merchant-recorded cash, merchant declaration), and
 * missing information is named, never estimated.
 */

type Money = { minor: string; currency?: string };
type Bucket = { start: string; amountMinor: string; paymentCount: number };
type Credit = {
  status: string;
  modelVersion?: string;
  financialProfile: { score: number } | null;
  creditScore?: { score: number; grade: string } | null;
  profileConfidence: {
    label: string;
    fieldsFilled: number;
    fieldsTotal: number;
  } | null;
  missingReasons: Record<string, string>;
  indicators?: Record<string, number | string | null>;
  provenance?: Record<string, string>;
  integritySummary: string[];
};
type Assessment = {
  id: string;
  modelVersion?: string;
  stage: string;
  createdAt: string;
  evidenceWindow: { from: string; to: string; days?: number };
  passedRequirements: string[];
  missingRequirements: string[];
  reliability?: Record<string, unknown>;
  limitations?: string[];
  businessProfile?: {
    businessName?: string;
    timezone?: string;
    consent?: { active?: boolean };
    creditProfile?: Record<string, unknown>;
  };
  credit?: Credit;
};
export type FinanceReportSnapshot = {
  businessName: string;
  generatedAt: string;
  demonstrationData?: boolean;
  assessment?: Assessment | null;
  analytics: {
    period?: { from: string; to: string; timezone?: string };
    totalRecordedSales: Money;
    saleCount: number;
    averageSale?: Money;
    digitalSales: Money;
    cashSales: Money;
    sourceCoverage?: Record<string, number>;
    dailyTrend?: Bucket[];
  };
  productMetrics?: Array<{
    name: string;
    quantitySold: number;
    revenue: Money;
  }>;
  reconciliation?: {
    coverage?: boolean;
    items?: Array<{
      externalReference: string;
      sourceName?: string;
      expectedAmountMinor?: string | null;
      actualAmountMinor?: string | null;
      reconciliationStatus: string;
    }>;
  };
  exportIntegrity?: {
    detailRowCount: number;
    detailAmountMinor: string;
    reconciles: boolean;
    discrepancy?: string;
  };
  limitations?: string[];
};

// ── Layout and palette (matches the merchant portal) ────────────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 48;
const W = PAGE_W - M * 2;
const TOP = 64;
const BOTTOM = PAGE_H - 64;
const C = {
  blue: '#165DFF',
  ink: '#0f172a',
  body: '#334155',
  muted: '#64748b',
  line: '#e2e8f0',
  soft: '#f8fafc',
  green: '#047857',
  greenBg: '#ecfdf5',
  greenLine: '#a7f3d0',
  amber: '#b45309',
  amberBg: '#fffbeb',
  amberLine: '#fde68a',
  rose: '#be123c',
  roseBg: '#fff1f2',
  roseLine: '#fecdd3',
};
const REGULAR = 'Helvetica';
const BOLD = 'Helvetica-Bold';

// ── Formatting ───────────────────────────────────────────────────────────
const EUR = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
});
function eur(minor: string | null | undefined) {
  if (minor === null || minor === undefined || minor === '') return '—';
  return EUR.format(Number(BigInt(String(minor))) / 100);
}
function pct(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}
function dateFmt(iso: string | undefined, timeZone: string, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
    timeZone,
  }).format(d);
}
function stageName(stage: string) {
  return CREDIT_STAGE_LABELS[stage] ?? stage.replaceAll('_', ' ');
}
function inputLabel(key: string) {
  return (
    CREDIT_INPUT_LABELS[key] ??
    key.replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase())
  );
}
function inputValue(
  key: string,
  value: number | string | null | undefined,
  tz: string,
) {
  if (value === null || value === undefined || value === '')
    return 'Not available';
  if (key === 'merchant_type')
    return MERCHANT_CATEGORY_LABELS[String(value)] ?? String(value);
  if (key === 'commencement_date') return dateFmt(String(value), tz);
  if (typeof value === 'string')
    return value.length > 90 ? `${value.slice(0, 87)}…` : value;
  if (key.endsWith('_eur')) return EUR.format(value);
  if (
    [
      'finalized_payments',
      'loan_term_months',
      'external_bureau_score',
    ].includes(key)
  )
    return String(Math.round(value));
  if (key === 'cv_txn_value') return value.toFixed(2);
  return `${value.toFixed(1)}%`;
}
const SOURCE_LABELS: Record<string, string> = {
  mcbuse_live_payments: 'MCBuse payments (verified)',
  mcbuse_live_payments_and_merchant_cash:
    'MCBuse payments and merchant-recorded cash',
  merchant_recorded_cash: 'Merchant-recorded cash',
  mcbuse_processing_records: 'MCBuse payment processing',
  merchant_declared: 'Declared by the business',
};
const MISSING_GROUPS: Record<
  MissingInputKind,
  { title: string; note: string }
> = {
  declare: {
    title: 'Information the business can provide',
    note: 'Not declared at the time of the assessment.',
  },
  sales: {
    title: 'Builds up with recorded sales',
    note: 'Not enough recorded sales in the evidence window to calculate these yet.',
  },
  system: {
    title: 'Not currently measured by MCBuse',
    note: 'MCBuse does not yet have the data needed for these.',
  },
};
const READINESS_CHECKS: Array<{
  api: string;
  label: string;
  measure?: { key: string; target: number; unit?: '%'; noun?: string };
}> = [
  {
    api: 'At least 30 observed days',
    label: 'At least 30 days of records',
    measure: { key: 'observedDays', target: 30, noun: 'days' },
  },
  {
    api: 'At least 10 active days',
    label: 'Sales on at least 10 days',
    measure: { key: 'activeDays', target: 10, noun: 'days' },
  },
  {
    api: 'At least 25 finalized payments',
    label: 'At least 25 verified payments',
    measure: { key: 'finalizedPayments', target: 25, noun: 'payments' },
  },
  {
    api: 'Capture quality of at least 98%',
    label: 'Payment capture quality of 98% or more',
    measure: { key: 'captureQualityPercent', target: 98, unit: '%' },
  },
  {
    api: 'Payment finality of at least 98%',
    label: '98% or more of payments completed',
    measure: { key: 'finalityPercent', target: 98, unit: '%' },
  },
  {
    api: 'Evidence consent is active',
    label: 'Consent to use business records',
  },
  {
    api: 'No unresolved critical exception',
    label: 'No unresolved critical payment issues',
  },
];
const DECLARED_FIELDS: Array<[string, string]> = [
  ['commencementDate', 'Business start date'],
  ['merchantType', 'Merchant category'],
  ['loanAmountMinor', 'Requested loan amount'],
  ['loanTermMonths', 'Requested loan term'],
  ['collateralValueMinor', 'Declared collateral value'],
  ['inventoryValueMinor', 'Declared inventory value'],
  ['businessAssetsMinor', 'Business assets'],
  ['businessDebtsMinor', 'Business debts'],
  ['existingDebtMinor', 'Existing debt'],
  ['ownerPersonalAssetsMinor', 'Owner personal assets'],
  ['ownerPersonalDebtsMinor', 'Owner personal debts'],
  ['externalBureauScore', 'External bureau score'],
  ['externalBureauReport', 'External bureau notes'],
];

// ── Drawing primitives ───────────────────────────────────────────────────
type Doc = PDFKit.PDFDocument;
type Cell = { text: string; color?: string; bold?: boolean };
type Column = { header: string; width: number; align?: 'left' | 'right' };
type Line = {
  text: string;
  size?: number;
  bold?: boolean;
  color?: string;
  gapBefore?: number;
};
type Tone = 'green' | 'amber' | 'rose' | 'soft';
const TONES: Record<Tone, [string, string]> = {
  green: [C.greenBg, C.greenLine],
  amber: [C.amberBg, C.amberLine],
  rose: [C.roseBg, C.roseLine],
  soft: [C.soft, C.line],
};

class Writer {
  y = TOP;
  constructor(readonly doc: Doc) {}

  ensure(height: number) {
    if (this.y + height > BOTTOM) {
      this.doc.addPage();
      this.y = TOP;
    }
  }
  gap(h: number) {
    this.y += h;
  }
  private measure(line: Line, width: number) {
    this.doc.font(line.bold ? BOLD : REGULAR).fontSize(line.size ?? 9.5);
    return this.doc.heightOfString(line.text, { width, lineGap: 2 });
  }
  text(
    value: string,
    opts: Omit<Line, 'text'> & { x?: number; width?: number } = {},
  ) {
    const x = opts.x ?? M;
    const width = opts.width ?? W;
    const h = this.measure({ text: value, ...opts }, width);
    this.ensure(h);
    this.doc
      .fillColor(opts.color ?? C.body)
      .text(value, x, this.y, { width, lineGap: 2 });
    this.y += h;
  }
  rule(color = C.line) {
    this.doc
      .moveTo(M, this.y)
      .lineTo(M + W, this.y)
      .lineWidth(0.75)
      .strokeColor(color)
      .stroke();
  }
  section(title: string, subtitle?: string) {
    // Keep the heading with its first rows rather than stranding it.
    this.ensure(150);
    this.gap(20);
    this.text(title, { size: 13.5, bold: true, color: C.ink });
    if (subtitle) {
      this.gap(3);
      this.text(subtitle, { size: 8.5, color: C.muted });
    }
    this.gap(7);
    this.rule();
    this.gap(10);
  }
  subheading(title: string, color = C.ink) {
    this.ensure(110);
    this.text(title, { size: 10.5, bold: true, color });
    this.gap(5);
  }
  /** A tinted panel sized to its lines, kept on one page. */
  box(tone: Tone, lines: Line[], pad = 14) {
    const inner = W - pad * 2;
    const height =
      lines.reduce(
        (sum, l) => sum + (l.gapBefore ?? 0) + this.measure(l, inner),
        0,
      ) +
      pad * 2;
    this.ensure(height);
    const [fill, stroke] = TONES[tone];
    this.doc
      .roundedRect(M, this.y, W, height, 6)
      .lineWidth(0.75)
      .fillAndStroke(fill, stroke);
    let y = this.y + pad;
    for (const l of lines) {
      y += l.gapBefore ?? 0;
      const h = this.measure(l, inner);
      this.doc
        .fillColor(l.color ?? C.body)
        .text(l.text, M + pad, y, { width: inner, lineGap: 2 });
      y += h;
    }
    this.y += height;
  }
  table(columns: Column[], rows: Cell[][], empty?: string, showHeader = true) {
    const padX = 6;
    const padY = 5;
    const header = () => {
      const h = 18;
      this.doc.rect(M, this.y, W, h).fill(C.soft);
      let x = M;
      this.doc.font(BOLD).fontSize(7.5).fillColor(C.muted);
      for (const col of columns) {
        this.doc.text(col.header.toUpperCase(), x + padX, this.y + 5.5, {
          width: col.width - padX * 2,
          align: col.align ?? 'left',
          lineBreak: false,
          characterSpacing: 0.3,
        });
        x += col.width;
      }
      this.y += h;
    };
    this.ensure(44);
    if (showHeader) header();
    if (!rows.length) {
      if (empty) {
        this.gap(6);
        this.text(empty, {
          size: 9,
          color: C.muted,
          x: M + padX,
          width: W - padX * 2,
        });
        this.gap(4);
      }
      return;
    }
    for (const row of rows) {
      const h =
        Math.max(
          ...row.map((cell, i) => {
            this.doc.font(cell.bold ? BOLD : REGULAR).fontSize(9);
            return this.doc.heightOfString(cell.text, {
              width: columns[i].width - padX * 2,
              lineGap: 1.5,
            });
          }),
        ) +
        padY * 2;
      if (this.y + h > BOTTOM) {
        this.doc.addPage();
        this.y = TOP;
        if (showHeader) header();
        else this.rule();
      }
      let x = M;
      row.forEach((cell, i) => {
        const col = columns[i];
        this.doc
          .font(cell.bold ? BOLD : REGULAR)
          .fontSize(9)
          .fillColor(cell.color ?? C.body)
          .text(cell.text, x + padX, this.y + padY, {
            width: col.width - padX * 2,
            align: col.align ?? 'left',
            lineGap: 1.5,
          });
        x += col.width;
      });
      this.y += h;
      this.rule();
    }
  }
  details(rows: Array<[string, string, string?]>, labelWidth = 190) {
    this.table(
      [
        { header: 'Item', width: labelWidth },
        { header: 'Detail', width: W - labelWidth },
      ],
      rows.map(([label, value, color]) => [
        { text: label, color: C.muted },
        { text: value, color: color ?? C.ink },
      ]),
      undefined,
      false,
    );
  }
  bullets(items: string[]) {
    for (const item of items) {
      this.doc.font(REGULAR).fontSize(9);
      const h = this.doc.heightOfString(item, { width: W - 14, lineGap: 2 });
      this.ensure(h + 3);
      this.doc.circle(M + 3, this.y + 5, 1.6).fill(C.muted);
      this.doc
        .fillColor(C.body)
        .text(item, M + 14, this.y, { width: W - 14, lineGap: 2 });
      this.y += h + 4;
    }
  }
}

function kpis(
  w: Writer,
  items: Array<{ label: string; value: string; hint?: string }>,
) {
  const gapX = 10;
  const bw = (W - gapX * (items.length - 1)) / items.length;
  const h = 64;
  w.ensure(h + 4);
  items.forEach((item, i) => {
    const x = M + i * (bw + gapX);
    w.doc
      .roundedRect(x, w.y, bw, h, 6)
      .lineWidth(0.75)
      .fillAndStroke('#ffffff', C.line);
    w.doc
      .font(BOLD)
      .fontSize(7)
      .fillColor(C.muted)
      .text(item.label.toUpperCase(), x + 10, w.y + 10, {
        width: bw - 20,
        lineBreak: false,
        characterSpacing: 0.3,
      });
    w.doc
      .font(BOLD)
      .fontSize(15)
      .fillColor(C.ink)
      .text(item.value, x + 10, w.y + 23, { width: bw - 20, lineBreak: false });
    if (item.hint)
      w.doc
        .font(REGULAR)
        .fontSize(7.5)
        .fillColor(C.muted)
        .text(item.hint, x + 10, w.y + 45, {
          width: bw - 20,
          lineBreak: false,
        });
  });
  w.y += h;
}

function salesChart(w: Writer, buckets: Bucket[], tz: string) {
  const h = 60;
  w.ensure(h + 26);
  const values = buckets.map((b) => Number(b.amountMinor));
  const max = Math.max(1, ...values);
  const gap = buckets.length > 60 ? 0 : 1.5;
  const bw = (W - gap * (buckets.length - 1)) / buckets.length;
  const base = w.y + h;
  w.doc
    .font(REGULAR)
    .fontSize(7.5)
    .fillColor(C.muted)
    .text(`Highest day ${eur(String(max))}`, M, w.y - 12, {
      width: W,
      align: 'right',
      lineBreak: false,
    });
  values.forEach((v, i) => {
    if (v <= 0) return;
    const bh = Math.max(1.5, (v / max) * h);
    w.doc
      .rect(M + i * (bw + gap), base - bh, Math.max(0.6, bw), bh)
      .fill(C.blue);
  });
  w.doc
    .moveTo(M, base)
    .lineTo(M + W, base)
    .lineWidth(0.75)
    .strokeColor(C.line)
    .stroke();
  w.doc
    .font(REGULAR)
    .fontSize(7.5)
    .fillColor(C.muted)
    .text(dateFmt(buckets[0].start, tz), M, base + 4, { lineBreak: false })
    .text(dateFmt(buckets[buckets.length - 1].start, tz), M, base + 4, {
      width: W,
      align: 'right',
      lineBreak: false,
    });
  w.y = base + 18;
}

// ── Report ───────────────────────────────────────────────────────────────
export function renderFinanceReport(
  snapshot: FinanceReportSnapshot,
  id: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      // Small bottom margin so the footer text never triggers an automatic page.
      margins: { top: TOP, bottom: 20, left: M, right: M },
      bufferPages: true,
      info: {
        Title: `Financial evidence report – ${snapshot.businessName}`,
        Author: 'MCBuse',
        Subject: 'Business financial evidence report',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      draw(doc, snapshot, id);
      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function draw(doc: Doc, s: FinanceReportSnapshot, id: string) {
  const w = new Writer(doc);
  const a = s.assessment ?? null;
  const credit = a?.credit;
  const tz =
    a?.businessProfile?.timezone ?? s.analytics.period?.timezone ?? 'UTC';
  const shortRef = id.slice(0, 8).toUpperCase();
  const an = s.analytics;
  const total = Number(an.totalRecordedSales.minor);
  const digital = Number(an.digitalSales.minor);
  const cash = Number(an.cashSales.minor);
  const score = credit?.financialProfile?.score;
  const creditScore = credit?.creditScore ?? null;
  const missing = Object.entries(credit?.missingReasons ?? {});
  const counts: Record<MissingInputKind, number> = {
    declare: 0,
    sales: 0,
    system: 0,
  };
  for (const [, reason] of missing) counts[missingInputKind(reason)] += 1;

  // Masthead
  doc
    .font(BOLD)
    .fontSize(16)
    .fillColor(C.blue)
    .text('MCBuse', M, 28, { lineBreak: false });
  doc
    .font(REGULAR)
    .fontSize(8.5)
    .fillColor(C.muted)
    .text('Business financial evidence report', M, 33, {
      width: W,
      align: 'right',
      lineBreak: false,
    });
  doc
    .moveTo(M, 52)
    .lineTo(M + W, 52)
    .lineWidth(1.5)
    .strokeColor(C.blue)
    .stroke();
  w.y = 72;

  w.text(s.businessName, { size: 24, bold: true, color: C.ink });
  w.gap(4);
  const period = an.period;
  w.text(
    period
      ? `Reporting period: ${dateFmt(period.from, tz)} – ${dateFmt(period.to, tz)}`
      : 'Reporting period not recorded',
    { size: 11, color: C.body },
  );
  w.gap(14);

  const meta: Array<[string, string]> = [
    ['Report date', dateFmt(s.generatedAt, tz)],
    ['Reference', shortRef],
    ['Assessment date', a ? dateFmt(a.createdAt, tz) : 'None attached'],
    ['Evidence status', a ? stageName(a.stage) : '—'],
  ];
  const mw = W / meta.length;
  meta.forEach(([label, value], i) => {
    doc
      .font(BOLD)
      .fontSize(7)
      .fillColor(C.muted)
      .text(label.toUpperCase(), M + i * mw, w.y, {
        width: mw - 8,
        lineBreak: false,
        characterSpacing: 0.3,
      });
    doc
      .font(REGULAR)
      .fontSize(10)
      .fillColor(C.ink)
      .text(value, M + i * mw, w.y + 11, { width: mw - 8, lineBreak: false });
  });
  w.y += 32;
  w.gap(10);

  if (s.demonstrationData) {
    w.box('rose', [
      { text: 'Demonstration data', size: 10.5, bold: true, color: C.rose },
      {
        text: 'This report contains labelled demonstration records and must not be used for a lending decision.',
        size: 9,
        gapBefore: 2,
      },
    ]);
    w.gap(10);
  }

  // Result banner
  if (creditScore) {
    const conf = credit?.profileConfidence;
    w.box('green', [
      { text: 'CREDIT SCORE', size: 8, bold: true, color: C.green },
      {
        text: `${creditScore.score}  ·  ${creditScore.grade}`,
        size: 28,
        bold: true,
        color: C.ink,
        gapBefore: 4,
      },
      {
        text: `On a scale of 300 to 850: ${CREDIT_GRADE_BANDS.slice()
          .reverse()
          .map((b) =>
            b.from === 300
              ? `${b.grade} below ${b.to + 1}`
              : b.to === 850
                ? `${b.grade} ${b.from}+`
                : `${b.grade} ${b.from}–${b.to}`,
          )
          .join(
            ', ',
          )}.${conf ? ` Calculated from ${conf.fieldsFilled} of ${conf.fieldsTotal} inputs. Data confidence: ${conf.label}.` : ''}`,
        size: 9.5,
        gapBefore: 4,
      },
      {
        text: 'Calculated by MCBuse from the business’s recorded sales and declared information. It is not a loan approval or lending decision.',
        size: 8.5,
        color: C.muted,
        gapBefore: 3,
      },
    ]);
  } else if (typeof score === 'number') {
    const conf = credit?.profileConfidence;
    const band = financialProfileBand(score);
    // Only a Good or Strong profile gets the green "positive" banner, so the
    // colour never tells a better story than the number does.
    const tone =
      band.label === 'Strong' || band.label === 'Good'
        ? 'green'
        : band.label === 'Fair'
          ? 'soft'
          : 'amber';
    const accent =
      tone === 'green' ? C.green : tone === 'amber' ? C.amber : C.muted;
    const checksTotal =
      (a?.passedRequirements.length ?? 0) +
      (a?.missingRequirements.length ?? 0);
    w.box(tone, [
      { text: 'FINANCIAL PROFILE SCORE', size: 8, bold: true, color: accent },
      {
        text: `${score.toFixed(1)} / 100  ·  ${band.label}`,
        size: 28,
        bold: true,
        color: C.ink,
        gapBefore: 4,
      },
      {
        text: conf
          ? `Data confidence: ${conf.label}. ${conf.fieldsFilled} of ${conf.fieldsTotal} inputs were available${
              checksTotal
                ? ` and ${a?.passedRequirements.length ?? 0} of ${checksTotal} evidence checks were met`
                : ''
            }. Data confidence describes how complete and reliable the records are, not how strong the business is.`
          : 'Higher scores indicate a stronger recorded business profile.',
        size: 9.5,
        gapBefore: 4,
      },
      {
        text: 'This score summarises recorded business activity. It is not a credit score, loan approval or lending decision.',
        size: 8.5,
        color: C.muted,
        gapBefore: 3,
      },
    ]);
  } else if (a) {
    const reason =
      credit?.status === 'consent_required'
        ? 'Evidence consent was not active when the assessment ran, so no score was calculated.'
        : credit?.status === 'temporarily_unavailable'
          ? 'The scoring service was temporarily unavailable when the assessment ran.'
          : credit
            ? `${missing.length} required ${missing.length === 1 ? 'input was' : 'inputs were'} missing when the assessment ran.`
            : 'This assessment checked evidence readiness only; no score was requested.';
    const breakdown = [
      counts.declare ? `${counts.declare} can be provided by the business` : '',
      counts.sales ? `${counts.sales} build up with recorded sales` : '',
      counts.system ? `${counts.system} are not currently measured` : '',
    ]
      .filter(Boolean)
      .join('  ·  ');
    w.box('amber', [
      { text: 'CREDIT SCORE', size: 8, bold: true, color: C.amber },
      {
        text: 'Not available yet',
        size: 20,
        bold: true,
        color: C.ink,
        gapBefore: 4,
      },
      { text: reason, size: 9.5, gapBefore: 4 },
      ...(breakdown
        ? [{ text: `Missing inputs: ${breakdown}.`, size: 9, gapBefore: 2 }]
        : []),
      {
        text: 'Missing values are never estimated or filled in.',
        size: 8.5,
        color: C.muted,
        gapBefore: 3,
      },
    ]);
  }

  // Recorded activity
  w.section(
    'Recorded activity',
    'All sales recorded in the reporting period, from MCBuse payments and merchant-recorded cash.',
  );
  kpis(w, [
    {
      label: 'Recorded sales',
      value: eur(an.totalRecordedSales.minor),
      hint: 'Total value',
    },
    {
      label: 'Number of sales',
      value: an.saleCount.toLocaleString('en-IE'),
      hint: 'Transactions',
    },
    {
      label: 'Average sale',
      value: an.averageSale
        ? eur(an.averageSale.minor)
        : an.saleCount
          ? EUR.format(total / 100 / an.saleCount)
          : '—',
      hint: 'Per transaction',
    },
    {
      label: 'Cash share',
      value: pct(cash, total),
      hint: `${pct(digital, total)} via MCBuse payments`,
    },
  ]);
  if (an.dailyTrend?.some((b) => Number(b.amountMinor) > 0)) {
    w.gap(18);
    w.subheading('Daily recorded sales');
    w.gap(8);
    salesChart(w, an.dailyTrend, tz);
  }
  w.gap(12);
  w.subheading('Sales by source');
  w.table(
    [
      { header: 'Source', width: 150 },
      { header: 'Sales value', width: 90, align: 'right' },
      { header: 'Share', width: 55, align: 'right' },
      { header: 'How it is evidenced', width: W - 295 },
    ],
    [
      [
        { text: 'MCBuse payments', bold: true, color: C.ink },
        { text: eur(an.digitalSales.minor) },
        { text: pct(digital, total) },
        { text: 'Verified by MCBuse when the payment was made.' },
      ],
      [
        { text: 'Cash sales', bold: true, color: C.ink },
        { text: eur(an.cashSales.minor) },
        { text: pct(cash, total) },
        { text: 'Recorded by the merchant; not independently verified.' },
      ],
    ],
  );

  const products = s.productMetrics ?? [];
  w.gap(16);
  w.subheading('Top products');
  w.table(
    [
      { header: 'Product', width: W - 240 },
      { header: 'Units sold', width: 75, align: 'right' },
      { header: 'Sales value', width: 90, align: 'right' },
      { header: 'Share', width: 75, align: 'right' },
    ],
    products
      .slice(0, 10)
      .map((p) => [
        { text: p.name, color: C.ink },
        { text: p.quantitySold.toLocaleString('en-IE') },
        { text: eur(p.revenue.minor) },
        { text: pct(Number(p.revenue.minor), total) },
      ]),
    'No product-linked sales in the reporting period.',
  );
  if (products.length > 10) {
    w.gap(4);
    w.text(
      `Top 10 of ${products.length} products. The full list is in product-metrics.csv in the data package.`,
      { size: 8, color: C.muted },
    );
  }

  // ── Assessment detail ──────────────────────────────────────────────────
  if (a) {
    w.section(
      'Credit assessment',
      `Calculated from records between ${dateFmt(a.evidenceWindow.from, tz)} and ${dateFmt(a.evidenceWindow.to, tz)}${a.evidenceWindow.days ? ` (${a.evidenceWindow.days} days)` : ''}. This evidence window can differ from the reporting period above.`,
    );
    const consent = credit
      ? credit.status === 'consent_required'
        ? 'Not active'
        : 'Active'
      : a.businessProfile?.consent?.active
        ? 'Active'
        : 'Not recorded';
    w.details([
      ['Assessment date', dateFmt(a.createdAt, tz, true)],
      ['Evidence status', stageName(a.stage)],
      creditScore
        ? [
            'Credit score',
            `${creditScore.score} of 850 · ${creditScore.grade}`,
            C.green,
          ]
        : [
            'Financial profile score',
            typeof score === 'number'
              ? `${score.toFixed(1)} / 100 · ${financialProfileBand(score).label}`
              : 'Not available',
            typeof score === 'number' ? C.green : C.amber,
          ],
      [
        'Data confidence',
        credit?.profileConfidence
          ? `${credit.profileConfidence.label} (${credit.profileConfidence.fieldsFilled} of ${credit.profileConfidence.fieldsTotal} inputs available)`
          : 'Not available',
      ],
      [
        'Consent to use business records',
        consent,
        consent === 'Active' ? C.green : C.amber,
      ],
    ]);

    if (credit) {
      const indicators = credit.indicators ?? {};
      const provenance = credit.provenance ?? {};
      const missingKeys = new Set(Object.keys(credit.missingReasons));
      const used = Object.keys(provenance).filter(
        (k) =>
          !missingKeys.has(k) &&
          provenance[k] !== 'unavailable' &&
          indicators[k] !== null &&
          indicators[k] !== undefined,
      );
      w.gap(18);
      w.subheading(`Inputs used (${used.length})`, C.green);
      w.table(
        [
          { header: 'Input', width: 185 },
          { header: 'Value', width: 110, align: 'right' },
          { header: 'Source', width: W - 295 },
        ],
        used.map((k) => [
          { text: inputLabel(k), color: C.ink },
          { text: inputValue(k, indicators[k], tz), bold: true, color: C.ink },
          {
            text:
              SOURCE_LABELS[provenance[k] ?? ''] ??
              String(provenance[k] ?? '').replaceAll('_', ' '),
          },
        ]),
        'No inputs were available when the assessment ran.',
      );

      if (missing.length) {
        w.gap(18);
        w.subheading(`Inputs missing (${missing.length})`, C.amber);
        for (const kind of [
          'declare',
          'sales',
          'system',
        ] as MissingInputKind[]) {
          const items = missing.filter(([, r]) => missingInputKind(r) === kind);
          if (!items.length) continue;
          w.ensure(70);
          w.gap(4);
          w.text(`${MISSING_GROUPS[kind].title} (${items.length})`, {
            size: 9.5,
            bold: true,
            color: C.ink,
          });
          w.text(MISSING_GROUPS[kind].note, { size: 8.5, color: C.muted });
          w.gap(5);
          if (kind === 'system')
            w.table(
              [
                { header: 'Input', width: 185 },
                { header: 'Why it is missing', width: W - 185 },
              ],
              items.map(([k, reason]) => [
                { text: inputLabel(k), color: C.ink },
                { text: reason },
              ]),
            );
          else
            w.table(
              [
                { header: '', width: W / 2 },
                { header: '', width: W / 2 },
              ],
              Array.from({ length: Math.ceil(items.length / 2) }, (_, r) => [
                { text: inputLabel(items[r * 2][0]), color: C.ink },
                {
                  text: items[r * 2 + 1] ? inputLabel(items[r * 2 + 1][0]) : '',
                  color: C.ink,
                },
              ]),
              undefined,
              false,
            );
          w.gap(8);
        }
      }
    }

    // Declarations
    const declared = a.businessProfile?.creditProfile ?? {};
    w.section(
      'Business information',
      'Declared by the business. MCBuse has not independently verified these details.',
    );
    const provided: Array<[string, string, string?]> = [];
    const notProvided: string[] = [];
    for (const [key, label] of DECLARED_FIELDS) {
      const value = declared[key];
      const raw =
        typeof value === 'string' || typeof value === 'number'
          ? String(value)
          : '';
      if (raw === '') notProvided.push(label.toLowerCase());
      else if (key.endsWith('Minor')) provided.push([label, eur(raw)]);
      else if (key === 'merchantType')
        provided.push([label, MERCHANT_CATEGORY_LABELS[raw] ?? raw]);
      else if (key === 'commencementDate')
        provided.push([label, dateFmt(raw, tz)]);
      else if (key === 'loanTermMonths')
        provided.push([label, `${raw} months`]);
      else provided.push([label, raw]);
    }
    if (provided.length) w.details(provided);
    else
      w.text('No business information was declared.', {
        size: 9.5,
        color: C.ink,
      });
    if (notProvided.length) {
      w.gap(8);
      const list = notProvided.join(', ');
      w.text(`Not provided: ${list.charAt(0).toUpperCase()}${list.slice(1)}.`, {
        size: 9,
        color: C.muted,
      });
    }

    // Readiness checklist
    const passed = new Set(a.passedRequirements);
    const missingReq = new Set(a.missingRequirements);
    const checks = READINESS_CHECKS.filter(
      (c) => passed.has(c.api) || missingReq.has(c.api),
    );
    if (checks.length) {
      const met = checks.filter((c) => passed.has(c.api)).length;
      w.section(
        'Evidence readiness checklist',
        `${met} of ${checks.length} checks met. These checks describe how complete the recorded evidence is, not credit risk.`,
      );
      w.table(
        [
          { header: 'Check', width: W - 210 },
          { header: 'Recorded', width: 130, align: 'right' },
          { header: 'Status', width: 80 },
        ],
        checks.map((c) => {
          const raw = c.measure ? a.reliability?.[c.measure.key] : undefined;
          const value =
            typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
          const recorded = !c.measure
            ? '—'
            : value === null
              ? 'Not measured'
              : `${c.measure.unit === '%' ? `${value.toFixed(1)}%` : Math.round(value)} of ${c.measure.target}${c.measure.unit ?? ''}${c.measure.noun ? ` ${c.measure.noun}` : ''}`;
          const ok = passed.has(c.api);
          return [
            { text: c.label, color: C.ink },
            { text: recorded },
            {
              text: ok ? 'Met' : 'Not yet',
              bold: true,
              color: ok ? C.green : C.amber,
            },
          ];
        }),
      );
    }
  }

  // ── Payouts ────────────────────────────────────────────────────────────
  const payouts = s.reconciliation?.items ?? [];
  w.section(
    'Payout reconciliation',
    'Imported settlement records matched to payments. Payout records are not sales revenue.',
  );
  if (s.reconciliation?.coverage && payouts.length) {
    w.table(
      [
        { header: 'Payout reference', width: 145 },
        { header: 'Source', width: 110 },
        { header: 'Expected', width: 80, align: 'right' },
        { header: 'Received', width: 80, align: 'right' },
        { header: 'Status', width: W - 415 },
      ],
      payouts
        .slice(0, 15)
        .map((p) => [
          { text: p.externalReference, color: C.ink },
          { text: p.sourceName ?? '—' },
          { text: eur(p.expectedAmountMinor ?? null) },
          { text: eur(p.actualAmountMinor ?? null) },
          { text: p.reconciliationStatus.replaceAll('_', ' ') },
        ]),
    );
    if (payouts.length > 15)
      w.text(
        `Showing 15 of ${payouts.length}. All payouts are in payouts.csv in the data package.`,
        { size: 8, color: C.muted },
      );
  } else {
    w.text('No payout records were imported for this business.', {
      size: 9.5,
      color: C.muted,
    });
  }

  // ── How this report was prepared ───────────────────────────────────────
  w.section('How this report was prepared');
  const cov = an.sourceCoverage ?? {};
  const notes = [
    `Records included: ${(cov.mcbuse_payment ?? 0).toLocaleString('en-IE')} MCBuse payments and ${(cov.merchant_cash ?? 0).toLocaleString('en-IE')} merchant-recorded cash sales${cov.external_import ? `, plus ${cov.external_import} imported records` : ''}.`,
    'MCBuse payments are verified by MCBuse. Cash sales and business information are recorded or declared by the merchant and are not independently verified.',
  ];
  if (s.exportIntegrity)
    notes.push(
      s.exportIntegrity.reconciles
        ? `The accompanying data package contains ${s.exportIntegrity.detailRowCount.toLocaleString('en-IE')} sale records totalling ${eur(s.exportIntegrity.detailAmountMinor)}, which match the totals in this report.`
        : `The accompanying data does not match the totals in this report: ${s.exportIntegrity.discrepancy ?? 'see the data files'}.`,
    );
  notes.push(...(credit?.integritySummary ?? []));
  w.bullets(notes);

  w.gap(12);
  w.subheading('Report details');
  const detailRows: Array<[string, string, string?]> = [
    ['Report reference', id],
    ['Generated', `${dateFmt(s.generatedAt, tz, true)} (${tz})`],
  ];
  if (a) detailRows.push(['Assessment reference', a.id]);
  const modelVersion = credit?.modelVersion ?? a?.modelVersion;
  if (modelVersion) detailRows.push(['Scoring model version', modelVersion]);
  detailRows.push([
    'Data package',
    'sales.csv, sale-items.csv, product-metrics.csv, payouts.csv and snapshot.json accompany this report.',
  ]);
  w.details(detailRows);

  // ── Important information ──────────────────────────────────────────────
  const limits = [...(s.limitations ?? []), ...(a?.limitations ?? [])]
    .map((l) => l.replace(/George['’]s /g, 'The ').replace(/\bGeorge\b ?/g, ''))
    .filter((l, i, all) => all.indexOf(l) === i);
  w.gap(18);
  w.box('soft', [
    { text: 'Important information', size: 10, bold: true, color: C.ink },
    {
      text: 'This report is prepared by MCBuse from the business’s own records, at the business’s request. It is not a loan approval or lending decision. Lenders should apply their own assessment and policies.',
      size: 8.5,
      gapBefore: 4,
    },
    ...limits.map((l) => ({
      text: `•  ${l}`,
      size: 8.5,
      color: C.muted,
      gapBefore: 2,
    })),
  ]);

  // ── Footer on every page ───────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    doc
      .moveTo(M, PAGE_H - 44)
      .lineTo(M + W, PAGE_H - 44)
      .lineWidth(0.5)
      .strokeColor(C.line)
      .stroke();
    doc.font(REGULAR).fontSize(7.5).fillColor(C.muted);
    doc.text(
      `MCBuse  ·  ${s.businessName}  ·  Ref ${shortRef}`,
      M,
      PAGE_H - 36,
      { lineBreak: false },
    );
    doc.text(`Page ${i + 1} of ${range.count}`, M, PAGE_H - 36, {
      width: W,
      align: 'right',
      lineBreak: false,
    });
  }
}
