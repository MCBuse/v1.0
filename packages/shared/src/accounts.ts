/**
 * The account view shared between the API, the portal and the mobile app.
 *
 * Amounts are integer minor units as strings throughout. The settlement
 * position (USDC base units) is kept alongside the displayed figure rather
 * than hidden, and the converted EUR figure carries the note that says it is a
 * conversion and not an entitlement.
 */

export type AccountName = "holding" | "routine";

export type AccountActivityEntry = {
  id: string;
  kind: string;
  description: string;
  direction: "in" | "out";
  amountCents: string;
  occurredAt: string;
  status: string;
  reference: string | null;
};

export type AccountCard = {
  account: AccountName;
  name: string;
  purpose: string;
  availableCents: string;
  pendingCents: string;
  settlement: {
    currency: string;
    availableBaseUnits: string;
    pendingBaseUnits: string;
  };
  converted: {
    currency: "EUR";
    availableMinor: string;
    rate: number;
    quotedAt: string;
    note: string;
  };
  actions: string[];
  recentActivity: AccountActivityEntry[];
};

export type AccountsSummary = {
  accounts: AccountCard[];
  today: {
    businessDate: string;
    timezone: string;
    digitalReceiptsCents: string;
    digitalReceiptCount: number;
    cashRecordedCents: string;
    cashRecordedCount: number;
    note: string;
  };
  custody: {
    network: string;
    model: string;
    note: string;
  };
};

export type AccountOperation = {
  id: string;
  kind: string;
  status: string;
  amountCents: string | null;
  currency: string | null;
  settlementBaseUnits: string;
  settlementCurrency: string;
  chainSignature: string | null;
  providerReference: string | null;
  failureCode: string | null;
  createdAt: string;
  finalizedAt: string | null;
};

export type AccountOperationsPage = { operations: AccountOperation[] };

export type PayoutDestination = {
  id: string;
  kind: "bank" | "card";
  label: string;
  last4: string | null;
  eligible: boolean;
  reason?: string | null;
  methods?: string[];
};

export type PayoutCapability = {
  configured: boolean;
  payoutsEnabled: boolean;
  destinations: PayoutDestination[];
  problems: string[];
};

export type DayEndView = {
  businessDate: string;
  timezone: string;
  routine: { availableCents: string; pendingCents: string };
  today: {
    digitalReceiptsCents: string;
    digitalReceiptCount: number;
    cashRecordedMinor: string;
    cashRecordedCurrency: string;
    cashRecordedCount: number;
  };
  previousTransfers: Array<{
    operationId: string;
    amountCents: string;
    status: string;
    confirmedAt: string;
    chainSignature: string | null;
    actorUserId: string | null;
  }>;
  suggestion: {
    amountCents: string;
    /** Which limit produced the suggestion: the receipts or the balance. */
    cappedBy: string;
    explanation: string;
  };
  /** Cash is reported but never swept: it has no settlement value to move. */
  cashNote: string;
};
