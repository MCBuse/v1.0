/**
 * R.17 — does the detail in an exported package add up to the totals printed
 * beside it?
 *
 * A finance package puts a headline figure on page one and a list of sales in
 * the data export. Those came from two different reads, so they can disagree:
 * a truncated list, a period boundary applied differently, a void that landed
 * between the two queries. The package now carries the answer rather than
 * leaving a reader to add up a CSV to find out.
 */

export interface ExportedSale {
  amount: { minor: string };
  source: 'mcbuse_payment' | 'merchant_cash';
}

export interface ReportedTotals {
  saleCount: number;
  totalRecordedSales: { minor: string };
  digitalSales?: { minor: string };
  cashSales?: { minor: string };
}

export interface ExportIntegrity {
  /** Rows actually present in the export. */
  detailRowCount: number;
  detailAmountMinor: string;
  /** What the summary pages claim. */
  reportedSaleCount: number;
  reportedAmountMinor: string;
  countDifference: number;
  amountDifferenceMinor: string;
  reconciles: boolean;
  /** Present only when the two disagree; never a vague "check the data". */
  discrepancy: string | null;
}

export function exportIntegrityOf(
  sales: ExportedSale[],
  reported: ReportedTotals,
): ExportIntegrity {
  const detailAmount = sales.reduce(
    (sum, sale) => sum + BigInt(sale.amount.minor),
    0n,
  );
  const reportedAmount = BigInt(reported.totalRecordedSales.minor);
  const countDifference = sales.length - reported.saleCount;
  const amountDifference = detailAmount - reportedAmount;
  const reconciles = countDifference === 0 && amountDifference === 0n;

  const problems: string[] = [];
  if (countDifference !== 0) {
    problems.push(
      `the export lists ${sales.length} sale(s) while the summary reports ${reported.saleCount}`,
    );
  }
  if (amountDifference !== 0n) {
    problems.push(
      `the exported lines total ${detailAmount} minor units against a reported ${reportedAmount}`,
    );
  }

  return {
    detailRowCount: sales.length,
    detailAmountMinor: detailAmount.toString(),
    reportedSaleCount: reported.saleCount,
    reportedAmountMinor: reportedAmount.toString(),
    countDifference,
    amountDifferenceMinor: amountDifference.toString(),
    reconciles,
    discrepancy: problems.length ? problems.join('; ') : null,
  };
}

/**
 * What a truncated list must say about itself.
 *
 * Used where a rendered page genuinely cannot hold every row — a PDF summary
 * table — so the reader is told what they are not seeing and where the rest
 * is, instead of being shown a list that looks complete.
 */
export function truncationNote(
  shown: number,
  total: number,
  completeIn: string,
): string | null {
  if (shown >= total) return null;
  return `Showing ${shown} of ${total}. The complete list is in ${completeIn} in the data export.`;
}
