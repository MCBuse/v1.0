/** Storage values are permanent: preserve historical manual_adjustment records. */
export const STOCK_MOVEMENTS = {
  opening: 'opening_balance',
  restock: 'restock',
  adjustment: 'manual_adjustment',
  legacyAdjustment: 'adjustment',
  imported: 'import_snapshot',
} as const;
export const STOCK_ADJUSTMENT_REASONS = ['adjustment', 'restock'] as const;
