import { TransactionsView } from "../../transactions/transactions-view";

/** Transactions and receipts are payment records, so they live under Payment. */
export default function PaymentTransactionsPage() {
  return <TransactionsView />;
}
