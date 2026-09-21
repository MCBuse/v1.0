import { BadRequestException } from '@nestjs/common';
import { MerchantImportService } from './merchant-import.service';

describe('MerchantImportService column mapping', () => {
  const service = new MerchantImportService({} as never, {} as never, {} as never) as any;

  it('maps a nonstandard inventory export before validating it', () => {
    const rows = [{ item_title: 'Coffee', supplier_code: 'SKU-1', price_cents: '250', quantity_available: '7', exported_at: '2026-09-17T08:00:00Z' }];
    const mapping = { name: 'item_title', sku: 'supplier_code', unit_price_minor: 'price_cents', stock_on_hand: 'quantity_available', snapshot_at: 'exported_at' };
    const mapped = service.mappedRows(rows, mapping);
    expect(mapped[0]).toEqual({ name: 'Coffee', sku: 'SKU-1', unit_price_minor: '250', stock_on_hand: '7', snapshot_at: '2026-09-17T08:00:00Z' });
    expect(service.validateRows('inventory', mapped, true)).toEqual([]);
  });

  it('does not require snapshot metadata when stock import was not selected', () => {
    const rows = [{ name: 'Coffee', sku: 'SKU-1', unit_price_minor: '250', stock_on_hand: '7' }];
    expect(service.validateRows('inventory', rows, false)).toEqual([]);
    expect(service.validateRows('inventory', rows, true)).toContain('Row 2: stock_on_hand requires a snapshot_at timestamp');
  });

  it('rejects a mapping to a column that was not uploaded', () => {
    expect(() => service.validateFieldMap('inventory', ['title'], { name: 'missing' })).toThrow(BadRequestException);
  });

  it('keeps payout lifecycle separate from reconciliation evidence', () => {
    const base = { providerStatus: 'expected', expectedAmountMinor: 8200n, actualAmountMinor: 7900n, expectedAt: new Date('2026-09-01T00:00:00Z') };
    expect(service.payoutStatus(base)).toBe('settled');
    expect(service.payoutStatus({ ...base, actualAmountMinor: null })).toBe('delayed');
    expect(service.reconciliationStatus(base, false)).toBe('unmatched');
    expect(service.reconciliationStatus(base, true)).toBe('difference');
    expect(service.reconciliationStatus({ ...base, actualAmountMinor: 8200n }, true)).toBe('matched');
  });
});
