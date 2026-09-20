import { suggestDayEndAmount } from './day-end-suggestion';

describe('day-end transfer suggestion', () => {
  const base = {
    availableBaseUnits: 10_000_000n, // 10.00 available in Routine
    digitalReceiptsBaseUnits: 6_000_000n, // 6.00 taken digitally today
    alreadySweptBaseUnits: 0n,
  };

  it('suggests today’s digital receipts when funds allow', () => {
    const result = suggestDayEndAmount(base);
    expect(result.suggestedBaseUnits).toBe(6_000_000n);
    expect(result.cappedBy).toBe('none');
  });

  it('caps at the available balance when receipts exceed it', () => {
    const result = suggestDayEndAmount({
      ...base,
      availableBaseUnits: 4_000_000n,
    });
    expect(result.suggestedBaseUnits).toBe(4_000_000n);
    expect(result.cappedBy).toBe('available_funds');
  });

  it('subtracts what has already been swept today', () => {
    const result = suggestDayEndAmount({
      ...base,
      alreadySweptBaseUnits: 2_500_000n,
    });
    expect(result.suggestedBaseUnits).toBe(3_500_000n);
    expect(result.cappedBy).toBe('none');
  });

  it('suggests nothing once today’s receipts are fully swept', () => {
    const result = suggestDayEndAmount({
      ...base,
      alreadySweptBaseUnits: 6_000_000n,
    });
    expect(result.suggestedBaseUnits).toBe(0n);
    expect(result.cappedBy).toBe('already_swept');
  });

  it('never suggests a negative amount when more was swept than taken', () => {
    // Possible if the merchant also moved money manually.
    const result = suggestDayEndAmount({
      ...base,
      alreadySweptBaseUnits: 9_000_000n,
    });
    expect(result.suggestedBaseUnits).toBe(0n);
    expect(result.cappedBy).toBe('already_swept');
  });

  it('suggests nothing on a day with no digital receipts', () => {
    const result = suggestDayEndAmount({
      ...base,
      digitalReceiptsBaseUnits: 0n,
    });
    expect(result.suggestedBaseUnits).toBe(0n);
    expect(result.cappedBy).toBe('no_receipts');
  });

  it('suggests nothing when the Routine account is empty', () => {
    const result = suggestDayEndAmount({
      ...base,
      availableBaseUnits: 0n,
    });
    expect(result.suggestedBaseUnits).toBe(0n);
    expect(result.cappedBy).toBe('available_funds');
  });

  it('reports both caps when both bind, naming the tighter one', () => {
    const result = suggestDayEndAmount({
      availableBaseUnits: 1_000_000n,
      digitalReceiptsBaseUnits: 6_000_000n,
      alreadySweptBaseUnits: 4_000_000n,
    });
    // Receipts net of sweeps is 2.00; available is 1.00, so funds bind.
    expect(result.suggestedBaseUnits).toBe(1_000_000n);
    expect(result.cappedBy).toBe('available_funds');
  });

  it('exposes the figures behind the suggestion', () => {
    const result = suggestDayEndAmount({
      ...base,
      alreadySweptBaseUnits: 1_000_000n,
    });
    expect(result.sweepableBaseUnits).toBe(5_000_000n);
    expect(result.availableBaseUnits).toBe(10_000_000n);
    expect(result.digitalReceiptsBaseUnits).toBe(6_000_000n);
    expect(result.alreadySweptBaseUnits).toBe(1_000_000n);
  });

  it('treats recorded cash as outside the suggestion entirely', () => {
    // Cash never became a digital balance, so it cannot be swept. The caller
    // passes it only so the figure can be explained separately.
    const withCash = suggestDayEndAmount({
      ...base,
      cashRecordedBaseUnits: 9_000_000n,
    });
    const withoutCash = suggestDayEndAmount(base);
    expect(withCash.suggestedBaseUnits).toBe(withoutCash.suggestedBaseUnits);
    expect(withCash.cashRecordedBaseUnits).toBe(9_000_000n);
    expect(withCash.cashNote).toMatch(/cash/i);
  });
});
