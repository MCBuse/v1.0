import { http } from "@/lib/api/client";
import { moneyIntent } from "@/lib/api/money-intent";
import type { AccountOperation, AccountOperationsPage } from "@repo/shared";
import type {
  CreateOnrampSessionInput,
  CreateOnrampSessionResponse,
  OnrampTransactionList,
  OnrampTransactionStatus,
} from "./session-models";
function present(op: AccountOperation): OnrampTransactionStatus {
  const status =
    op.status === "finalized"
      ? "completed"
      : op.status === "reversed"
        ? "refunded"
        : op.status === "compensating"
          ? [
              "failed",
              "canceled",
              "requires_action",
              "requires_reconciliation",
              "disputed",
            ].includes(op.refundStatus ?? "")
            ? "refund_action_required"
            : "refund_pending"
          : op.status === "failed"
            ? "failed"
            : ["created", "collection_pending"].includes(op.status)
              ? "pending"
              : "processing";
  const cents = BigInt(op.amountCents ?? "0");
  return {
    id: op.id,
    provider: "stripe",
    status,
    fiatAmount: `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`,
    fiatCurrency: op.currency ?? "USD",
    cryptoAmount: op.settlementBaseUnits,
    cryptoCurrency: op.settlementCurrency,
    network: "devnet",
    walletAddress: "",
    txHash: op.chainSignature,
    createdAt: op.createdAt,
    updatedAt: op.finalizedAt ?? op.createdAt,
  };
}
export const onrampSessionRepository = {
  async createSession(
    input: CreateOnrampSessionInput,
  ): Promise<CreateOnrampSessionResponse> {
    if (
      input.fiatCurrency !== "USD" ||
      !/^\d+(\.\d{1,2})?$/.test(input.fiatAmount)
    )
      throw new Error("Enter a USD amount with at most two decimal places.");
    const [whole, fraction = ""] = input.fiatAmount.split(".");
    const body = {
      amountCents: (
        BigInt(whole) * 100n +
        BigInt(fraction.padEnd(2, "0"))
      ).toString(),
      method: input.method ?? "card",
    };
    const intent = await moneyIntent("funding", body);
    const raw = await http.post<{
      operationId: string;
      checkoutUrl: string | null;
    }>("/accounts/funding", body, {
      headers: { "Idempotency-Key": intent.key },
    });
    if (!raw.checkoutUrl)
      throw new Error(
        "Checkout preparation is pending. Retry to resume the same top-up.",
      );
    return {
      provider: "stripe",
      widgetUrl: raw.checkoutUrl,
      transactionId: raw.operationId,
      internalReference: raw.operationId,
    };
  },
  async getTransaction(id: string): Promise<OnrampTransactionStatus> {
    return present(
      await http.get<AccountOperation>(`/accounts/operations/${id}`),
    );
  },
  async listTransactions(limit = 10): Promise<OnrampTransactionList> {
    const raw = await http.get<AccountOperationsPage>("/accounts/operations");
    return {
      data: raw.operations
        .filter((op) => op.kind.startsWith("funding_"))
        .slice(0, limit)
        .map(present),
      limit,
    };
  },
};
