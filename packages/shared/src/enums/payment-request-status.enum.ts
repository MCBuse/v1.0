export enum PaymentRequestStatus {
  PENDING = 'pending',       // created, waiting to be paid
  COMPLETED = 'completed',   // paid successfully
  EXPIRED = 'expired',       // past expires_at
  CANCELLED = 'cancelled',   // manually cancelled by creator
}
