export const WALLET_TYPES = {
  SAVINGS: 'savings',
  ROUTINE: 'routine',
} as const;

export type WalletType = (typeof WALLET_TYPES)[keyof typeof WALLET_TYPES];
