import { MerchantActivityService } from './merchant-activity.service';

describe('MerchantActivityService cash-sale idempotency fingerprint', () => {
  const service = Object.create(MerchantActivityService.prototype) as {
    cashSaleFingerprint: (input: unknown, occurredAt: Date) => string;
  };
  const occurredAt = new Date('2026-09-17T10:00:00.000Z');

  it('treats equivalent item order as the same request', () => {
    const left = service.cashSaleFingerprint({
      description: 'Counter sale', stockAlreadyAccountedFor: false,
      lines: [
        { type: 'custom', name: 'Tea', quantity: 2, unitPriceMinor: '150' },
        { type: 'product', productId: '00000000-0000-4000-8000-000000000001', quantity: 1 },
      ],
    }, occurredAt);
    const right = service.cashSaleFingerprint({
      description: 'Counter sale', stockAlreadyAccountedFor: false,
      lines: [
        { type: 'product', productId: '00000000-0000-4000-8000-000000000001', quantity: 1 },
        { type: 'custom', name: 'Tea', quantity: 2, unitPriceMinor: '150' },
      ],
    }, occurredAt);
    expect(left).toBe(right);
  });

  it('changes when a material sale input changes', () => {
    const base = { description: 'Counter sale', stockAlreadyAccountedFor: false, lines: [{ type: 'custom', name: 'Tea', quantity: 2, unitPriceMinor: '150' }] };
    const amountChanged = { ...base, lines: [{ type: 'custom', name: 'Tea', quantity: 2, unitPriceMinor: '175' }] };
    expect(service.cashSaleFingerprint(base, occurredAt)).not.toBe(service.cashSaleFingerprint(amountChanged, occurredAt));
  });
});
