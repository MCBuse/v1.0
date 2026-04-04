export enum TransactionType {
  ON_RAMP = 'on_ramp',       // fiat → savings wallet
  OFF_RAMP = 'off_ramp',     // savings wallet → fiat
  INTERNAL = 'internal',     // savings ↔ routine (within same user)
  P2P = 'p2p',               // routine → routine (different users, QR/NFC)
  SWAP = 'swap',             // USDC ↔ EURC within savings wallet
}
