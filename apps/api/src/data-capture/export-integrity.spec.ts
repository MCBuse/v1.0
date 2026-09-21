import {
  exportIntegrityOf,
  truncationNote,
  type ExportedSale,
} from './export-integrity';

function sale(minor: string, source: ExportedSale['source'] = 'merchant_cash') {
  return { amount: { minor }, source };
}

describe('export integrity', () => {
  it('reconciles when the detail matches the reported totals', () => {
    const result = exportIntegrityOf([sale('1000'), sale('2500')], {
      saleCount: 2,
      totalRecordedSales: { minor: '3500' },
    });

    expect(result.reconciles).toBe(true);
    expect(result.discrepancy).toBeNull();
    expect(result.detailAmountMinor).toBe('3500');
    expect(result.detailRowCount).toBe(2);
  });

  it('names a missing row rather than only flagging a mismatch', () => {
    const result = exportIntegrityOf([sale('1000')], {
      saleCount: 2,
      totalRecordedSales: { minor: '3500' },
    });

    expect(result.reconciles).toBe(false);
    expect(result.countDifference).toBe(-1);
    expect(result.discrepancy).toContain('lists 1 sale(s)');
    expect(result.discrepancy).toContain('reports 2');
  });

  it('names an amount difference and its direction', () => {
    const result = exportIntegrityOf([sale('1000'), sale('2000')], {
      saleCount: 2,
      totalRecordedSales: { minor: '3500' },
    });

    expect(result.amountDifferenceMinor).toBe('-500');
    expect(result.discrepancy).toContain('3000 minor units');
    expect(result.discrepancy).toContain('reported 3500');
  });

  it('reports both problems at once', () => {
    const result = exportIntegrityOf([sale('1000')], {
      saleCount: 3,
      totalRecordedSales: { minor: '9000' },
    });

    expect(result.discrepancy).toContain(';');
  });

  it('handles an empty period without dividing by anything', () => {
    const result = exportIntegrityOf([], {
      saleCount: 0,
      totalRecordedSales: { minor: '0' },
    });

    expect(result.reconciles).toBe(true);
    expect(result.detailAmountMinor).toBe('0');
  });

  it('flags an empty export against a non-zero total', () => {
    const result = exportIntegrityOf([], {
      saleCount: 4,
      totalRecordedSales: { minor: '5000' },
    });

    expect(result.reconciles).toBe(false);
    expect(result.countDifference).toBe(-4);
  });

  it('keeps full precision on large amounts', () => {
    const result = exportIntegrityOf(
      [sale('9007199254740993'), sale('1')],
      {
        saleCount: 2,
        totalRecordedSales: { minor: '9007199254740994' },
      },
    );

    expect(result.reconciles).toBe(true);
    expect(result.detailAmountMinor).toBe('9007199254740994');
  });
});

describe('truncation notes', () => {
  it('says nothing when the whole list is shown', () => {
    expect(truncationNote(10, 10, 'product-metrics.csv')).toBeNull();
  });

  it('says nothing for a list shorter than the limit', () => {
    expect(truncationNote(3, 3, 'product-metrics.csv')).toBeNull();
  });

  it('says what is missing and where to find it', () => {
    expect(truncationNote(10, 42, 'product-metrics.csv')).toBe(
      'Showing 10 of 42. The complete list is in product-metrics.csv in the data export.',
    );
  });
});
