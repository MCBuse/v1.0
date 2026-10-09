import {
  displayUnitsToBaseUnits,
  baseUnitsToDisplay,
  addBaseUnits,
  subtractBaseUnits,
  compareBaseUnits,
  isValidBaseUnits,
  isPositive,
  formatMoneyDisplay,
} from '../money';

describe('displayUnitsToBaseUnits', () => {
  it('converts 1.00 to 1000000', () => {
    expect(displayUnitsToBaseUnits('1.00')).toBe('1000000');
  });

  it('converts 0.5 to 500000', () => {
    expect(displayUnitsToBaseUnits('0.5')).toBe('500000');
  });

  it('converts 100 (no decimal) to 100000000', () => {
    expect(displayUnitsToBaseUnits('100')).toBe('100000000');
  });

  it('truncates extra decimal places', () => {
    expect(displayUnitsToBaseUnits('1.1234567')).toBe('1123456');
  });

  it('handles 0', () => {
    expect(displayUnitsToBaseUnits('0')).toBe('0');
  });
});

describe('baseUnitsToDisplay', () => {
  it('converts 1000000 to 1', () => {
    expect(baseUnitsToDisplay('1000000')).toBe('1');
  });

  it('converts 500000 to 0.5', () => {
    expect(baseUnitsToDisplay('500000')).toBe('0.5');
  });

  it('converts 1 to 0.000001', () => {
    expect(baseUnitsToDisplay('1')).toBe('0.000001');
  });

  it('strips trailing zeros', () => {
    expect(baseUnitsToDisplay('1500000')).toBe('1.5');
  });
});

describe('addBaseUnits', () => {
  it('adds two amounts', () => {
    expect(addBaseUnits('1000000', '500000')).toBe('1500000');
  });

  it('handles large values', () => {
    expect(addBaseUnits('999999999999', '1')).toBe('1000000000000');
  });
});

describe('subtractBaseUnits', () => {
  it('subtracts correctly', () => {
    expect(subtractBaseUnits('1000000', '500000')).toBe('500000');
  });

  it('throws on insufficient balance', () => {
    expect(() => subtractBaseUnits('100', '200')).toThrow(
      'Insufficient balance',
    );
  });
});

describe('compareBaseUnits', () => {
  it('returns 0 for equal', () => {
    expect(compareBaseUnits('100', '100')).toBe(0);
  });

  it('returns -1 for less', () => {
    expect(compareBaseUnits('50', '100')).toBe(-1);
  });

  it('returns 1 for greater', () => {
    expect(compareBaseUnits('200', '100')).toBe(1);
  });
});

describe('isValidBaseUnits', () => {
  it('accepts valid integers', () => {
    expect(isValidBaseUnits('12345')).toBe(true);
  });

  it('rejects negative', () => {
    expect(isValidBaseUnits('-1')).toBe(false);
  });

  it('rejects decimals', () => {
    expect(isValidBaseUnits('1.5')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidBaseUnits('')).toBe(false);
  });
});

describe('isPositive', () => {
  it('returns true for positive', () => {
    expect(isPositive('1')).toBe(true);
  });

  it('returns false for zero', () => {
    expect(isPositive('0')).toBe(false);
  });
});

describe('formatMoneyDisplay', () => {
  it('formats with $ symbol and 2 decimals', () => {
    expect(formatMoneyDisplay('1500000', '$')).toBe('$1.50');
  });

  it('formats zero', () => {
    expect(formatMoneyDisplay('0', '€')).toBe('€0.00');
  });

  it('formats large amount', () => {
    expect(formatMoneyDisplay('123456789000', '$')).toBe('$123456.78');
  });
});
