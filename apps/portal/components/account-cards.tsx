"use client";

import type {
  AccountCard,
  AccountOperationsPage,
  AccountsSummary,
  PayoutCapability,
} from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Field, FieldLabel, FieldMessage, Input } from "@repo/ui/field";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Info,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useCallback, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { portalApi } from "@/lib/client/api";
import { operationIntent, finishOperationIntent } from "@/lib/client/operation-intent";
import { accountsApi, accountsFetcher } from "@/lib/client/accounts-api";
import { euroInputToMinor } from "@/lib/client/money-input";
import { usePortalResource } from "@/lib/client/use-portal-resource";

/** Cents to a readable amount. The API is integer-only; so is this. */
function money(cents: string, currency = "USD") {
  const negative = cents.startsWith("-");
  const digits = (negative ? cents.slice(1) : cents).padStart(3, "0");
  const value = Number(`${digits.slice(0, -2)}.${digits.slice(-2)}`);
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(negative ? -value : value);
}

function when(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

const ACTION_ICON: Record<string, typeof Plus> = {
  "Add money": Plus,
  "Move money": ArrowLeftRight,
  Pay: ArrowUpFromLine,
  Withdraw: ArrowDownToLine,
};

type FlowKind = "funding" | "transfer" | "withdrawal" | null;

/**
 * A.1–A.10 — the two accounts as a person reads them.
 *
 * Everything on this panel is money in ordinary units. The USDC position is
 * available behind "How this is held" rather than on the face of the card, and
 * the euro figure is always presented as a conversion with its timestamp,
 * never as a balance the merchant is owed in euro.
 */
export function AccountCards() {
  const summary = usePortalResource<AccountsSummary>("", 15_000, accountsFetcher);
  const operations = usePortalResource<AccountOperationsPage>("operations", 5000, accountsFetcher);
  const [flow, setFlow] = useState<FlowKind>(null);
  const [custodyOpen, setCustodyOpen] = useState(false);

  const refresh = summary.refresh;
  const onDone = useCallback(() => {
    setFlow(null);
    void refresh();
    window.dispatchEvent(new Event("merchant:refresh"));
  }, [refresh]);

  if (summary.error && !summary.data)
    return (
      <Alert className="border-amber-200 bg-amber-50 text-amber-900">
        <p className="font-semibold">Account balances could not be loaded.</p>
        <p className="mt-1">
          {summary.offline
            ? "You appear to be offline. The figures will return when the connection does."
            : summary.error.message}
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => void summary.refresh()}
        >
          <RefreshCw className="size-4" aria-hidden /> Try again
        </Button>
      </Alert>
    );

  if (!summary.data)
    return (
      <Card>
        <CardContent className="py-8 text-sm text-slate-500">
          Loading your accounts…
        </CardContent>
      </Card>
    );

  const { accounts, today, custody } = summary.data;

  return (
    <section className="grid gap-4" aria-label="Accounts">
      {summary.error ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          These figures were last updated successfully a moment ago; the most
          recent refresh failed.
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {accounts.map((account) => (
          <AccountPanel
            key={account.account}
            account={account}
            onAction={(label) =>
              setFlow(
                label === "Add money"
                  ? "funding"
                  : label === "Withdraw"
                    ? "withdrawal"
                    : label === "Move money"
                      ? "transfer"
                      : null,
              )
            }
          />
        ))}
      </div>

      <Card><CardHeader><h2 className="font-semibold">Money movement status</h2></CardHeader><CardContent>
        {operations.error ? <p role="alert">{operations.error.message}</p> : null}
        {operations.data?.operations.slice(0, 15).map(op => <div key={op.id} className="border-b py-3 text-sm">
          <p>{op.kind.replaceAll('_', ' ')} · {op.amountCents ? money(op.amountCents) : '—'}</p>
          <p>{op.status === 'reversed' ? 'Refund / return completed' : op.status === 'compensating' ? `Refund / return ${op.refundStatus ?? 'pending'}` : op.status.replaceAll('_', ' ')}</p>
          {op.needsAttention ? <p className="text-amber-800">Recovery needs attention. Reference: {op.id}</p> : null}
          {op.nextAttemptAt ? <p className="text-slate-500">Next check: {when(op.nextAttemptAt)}</p> : null}
        </div>)}
      </CardContent></Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <h2 className="font-semibold">Today</h2>
          <Badge tone="info">{today.businessDate}</Badge>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Digital receipts today
            </p>
            <p className="mt-1 font-mono text-xl tabular-nums text-slate-950">
              {money(today.digitalReceiptsCents)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {today.digitalReceiptCount} received · {today.timezone}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Cash recorded today
            </p>
            <p className="mt-1 font-mono text-xl tabular-nums text-slate-950">
              {money(today.cashRecordedCents, "EUR")}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {today.cashRecordedCount} recorded
            </p>
          </div>
          <p className="sm:col-span-2 text-sm text-slate-600">{today.note}</p>
        </CardContent>
      </Card>

      <div>
        <Button variant="ghost" size="sm" onClick={() => setCustodyOpen(true)}>
          <Info className="size-4" aria-hidden /> How this is held, and what the
          fees are
        </Button>
      </div>

      <Drawer open={custodyOpen} onOpenChange={setCustodyOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>How your money is held</DrawerTitle>
            <DrawerDescription>
              Custody, network and conversion, in plain terms.
            </DrawerDescription>
          </DrawerHeader>
          <div className="grid gap-4 px-4 pb-4 text-sm text-slate-700">
            <div>
              <p className="font-semibold text-slate-950">Custody</p>
              <p className="mt-1">{custody.model}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-950">Network</p>
              <p className="mt-1">{custody.network}</p>
            </div>
            <p>{custody.note}</p>
            {accounts.map((account) => (
              <div key={account.account} className="rounded-lg bg-slate-50 p-3">
                <p className="font-semibold text-slate-950">{account.name}</p>
                <p className="mt-1 font-mono text-xs tabular-nums text-slate-600">
                  {account.settlement.availableBaseUnits} base units of{" "}
                  {account.settlement.currency} available,{" "}
                  {account.settlement.pendingBaseUnits} pending
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {account.converted.note}
                </p>
              </div>
            ))}
          </div>
          <DrawerFooter>
            <Button variant="secondary" onClick={() => setCustodyOpen(false)}>
              Close
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <MoneyFlowDrawer kind={flow} onClose={() => setFlow(null)} onDone={onDone} />
    </section>
  );
}

function AccountPanel({
  account,
  onAction,
}: {
  account: AccountCard;
  onAction: (label: string) => void;
}) {
  const pending = BigInt(account.pendingCents);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-950">{account.name}</h2>
          <p className="mt-1 text-sm text-slate-500">{account.purpose}</p>
        </div>
        <Badge tone={account.account === "holding" ? "neutral" : "info"}>
          {account.account === "holding" ? "Holding" : "Routine"}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Available
          </p>
          <p className="font-mono text-3xl tabular-nums text-slate-950">
            {money(account.availableCents)}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {pending > 0n ? (
              <>
                <span className="font-mono tabular-nums">
                  {money(account.pendingCents)}
                </span>{" "}
                pending, not yet spendable
              </>
            ) : (
              "Nothing pending"
            )}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            About{" "}
            <span className="font-mono tabular-nums">
              {money(account.converted.availableMinor, "EUR")}
            </span>{" "}
            at {account.converted.rate.toFixed(4)}, quoted{" "}
            {when(account.converted.quotedAt)}.
          </p>
          <p className="mt-1 text-xs text-slate-500">{account.converted.note}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {account.actions.map((label) => {
            const Icon = ACTION_ICON[label] ?? Plus;
            return (
              <Button
                key={label}
                variant={label === "Pay" ? "secondary" : "primary"}
                size="sm"
                onClick={() => onAction(label)}
                disabled={label === "Pay"}
                title={
                  label === "Pay"
                    ? "Take a payment from the Payment page above"
                    : undefined
                }
              >
                <Icon className="size-4" aria-hidden /> {label}
              </Button>
            );
          })}
        </div>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
            Recent activity
          </p>
          {account.recentActivity.length ? (
            <ul className="grid gap-2">
              {account.recentActivity.slice(0, 5).map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-slate-800">
                      {entry.description}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {when(entry.occurredAt)} · {entry.status}
                    </span>
                  </span>
                  <span
                    className={`font-mono tabular-nums ${
                      entry.direction === "in"
                        ? "text-emerald-700"
                        : "text-slate-700"
                    }`}
                  >
                    {entry.direction === "in" ? "+" : "−"}
                    {money(entry.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              No movements on this account yet.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const FLOW_COPY = {
  funding: {
    title: "Add money",
    description:
      "Pay by card or bank debit. The money lands in Holding once the payment settles.",
  },
  transfer: {
    title: "Move money",
    description: "Move funds between your Holding and Routine accounts.",
  },
  withdrawal: {
    title: "Withdraw",
    description: "Send money from Holding to a payout destination.",
  },
} as const;

function MoneyFlowDrawer({
  kind,
  onClose,
  onDone,
}: {
  kind: FlowKind;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"holding-routine" | "routine-holding">(
    "holding-routine",
  );
  const [fundingMethod, setFundingMethod] = useState<"card" | "bank">("card");
  const [destinationId, setDestinationId] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const destinations = usePortalResource<PayoutCapability>(
    "payout-destinations",
    60_000,
    accountsFetcher,
  );

  if (!kind) return null;
  const copy = FLOW_COPY[kind];
  const amountCents = euroInputToMinor(amount);

  async function submit() {
    setError("");
    if (!amountCents || amountCents === "0") {
      setError("Enter an amount greater than zero.");
      return;
    }
    setPending(true);
    try {
      // One key per submission attempt: a retry after a network error replays
      // the original request rather than moving the money twice.
      const profile = await portalApi<{ id: string }>('me');
      const intentKind = `money-${kind}`;
      const idempotencyKey = operationIntent(profile.id, intentKind, { amountCents, direction, destinationId, fundingMethod });
      if (kind === "funding") {
        const result = await accountsApi<{ checkoutUrl: string | null }>(
          "funding",
          {
            method: "POST",
            headers: { "Idempotency-Key": idempotencyKey },
            body: JSON.stringify({ method: fundingMethod, amountCents }),
          },
        );
        if (result.checkoutUrl) {
          window.location.assign(result.checkoutUrl);
          return;
        }
        setError("The payment page could not be opened. Please try again.");
        return;
      }
      if (kind === "transfer") {
        const [from, to] = direction.split("-");
        await accountsApi("transfers", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: JSON.stringify({ from, to, amountCents }),
        });
      } else {
        if (!destinationId) {
          setError("Choose where the money should go.");
          setPending(false);
          return;
        }
        await accountsApi("withdrawals", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: JSON.stringify({ destinationId, amountCents }),
        });
      }
      finishOperationIntent(profile.id, intentKind);
      setAmount("");
      onDone();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The request could not be completed.",
      );
    } finally {
      setPending(false);
    }
  }

  const eligible = (destinations.data?.destinations ?? []).filter(
    (destination) => destination.eligible,
  );

  return (
    <Drawer open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{copy.title}</DrawerTitle>
          <DrawerDescription>{copy.description}</DrawerDescription>
        </DrawerHeader>
        <div className="grid gap-4 px-4 pb-4">
          {kind === 'funding' ? <Field><FieldLabel>Payment method</FieldLabel><select value={fundingMethod} onChange={e => setFundingMethod(e.target.value as 'card' | 'bank')} className="rounded border p-2"><option value="card">Card</option><option value="bank">Bank account</option></select></Field> : null}
          <Field>
            <FieldLabel htmlFor="account-amount">Amount</FieldLabel>
            <Input
              id="account-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <FieldMessage>Entered in whole currency units, e.g. 25.00</FieldMessage>
          </Field>

          {kind === "transfer" ? (
            <Field>
              <FieldLabel htmlFor="account-direction">Direction</FieldLabel>
              <select
                id="account-direction"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
                value={direction}
                onChange={(event) =>
                  setDirection(event.target.value as typeof direction)
                }
              >
                <option value="holding-routine">Holding → Routine</option>
                <option value="routine-holding">Routine → Holding</option>
              </select>
            </Field>
          ) : null}

          {kind === "withdrawal" ? (
            <Field>
              <FieldLabel htmlFor="account-destination">Send to</FieldLabel>
              <select
                id="account-destination"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
                value={destinationId}
                onChange={(event) => setDestinationId(event.target.value)}
              >
                <option value="">Choose a destination…</option>
                {eligible.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.label}
                    {destination.last4 ? ` ••${destination.last4}` : ""}
                  </option>
                ))}
              </select>
              {!destinations.loading && !eligible.length ? (
                <FieldMessage className="text-amber-700">
                  No eligible payout destination is set up yet
                  {destinations.data?.problems?.length
                    ? `: ${destinations.data.problems.join("; ")}`
                    : "."}
                </FieldMessage>
              ) : null}
            </Field>
          ) : null}

          {error ? (
            <Alert className="border-red-200 bg-red-50 text-red-800">{error}</Alert>
          ) : null}
        </div>
        <DrawerFooter>
          <Button onClick={() => void submit()} disabled={pending}>
            {pending ? "Working…" : copy.title}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
