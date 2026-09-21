"use client";

import type { DayEndView } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Field, FieldLabel, FieldMessage, Input } from "@repo/ui/field";
import { MoonStar, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { accountsApi, accountsFetcher } from "@/lib/client/accounts-api";
import { euroInputToMinor } from "@/lib/client/money-input";
import { usePortalResource } from "@/lib/client/use-portal-resource";

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

function centsToInput(cents: string) {
  const digits = cents.padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/**
 * The end-of-day sweep, 2D.
 *
 * The suggested amount is advisory and always editable, and the panel says
 * which of the two limits produced it. Cash appears because the merchant needs
 * to see it, and is never folded into the arithmetic.
 */
export function DayEndPanel() {
  const view = usePortalResource<DayEndView>("day-end", 30_000, accountsFetcher);
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);

  const suggested = view.data?.suggestion.amountCents;
  useEffect(() => {
    // The suggestion seeds the field, but stops overwriting it the moment the
    // merchant types: their number is the one that matters.
    if (!touched && suggested) setAmount(centsToInput(suggested));
  }, [suggested, touched]);

  if (view.error && !view.data)
    return (
      <Card>
        <CardHeader>
          <h2 className="font-semibold">End of day</h2>
        </CardHeader>
        <CardContent>
          <Alert className="border-amber-200 bg-amber-50 text-amber-900">
            <p>
              {view.offline
                ? "You appear to be offline, so today's figures are unavailable."
                : view.error.message}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void view.refresh()}
            >
              <RefreshCw className="size-4" aria-hidden /> Try again
            </Button>
          </Alert>
        </CardContent>
      </Card>
    );

  if (!view.data)
    return (
      <Card>
        <CardContent className="py-8 text-sm text-slate-500">
          Loading today&apos;s takings…
        </CardContent>
      </Card>
    );

  const { today, routine, suggestion, previousTransfers, cashNote, businessDate, timezone } =
    view.data;

  async function confirm() {
    setError("");
    setConfirmation("");
    const amountCents = euroInputToMinor(amount);
    if (!amountCents || amountCents === "0") {
      setError("Enter an amount greater than zero.");
      return;
    }
    setPending(true);
    try {
      await accountsApi("day-end", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ amountCents, businessDate }),
      });
      setConfirmation(
        `${money(amountCents)} is moving from Routine to Holding for ${businessDate}.`,
      );
      setTouched(false);
      await view.refresh();
      window.dispatchEvent(new Event("merchant:refresh"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The transfer could not be started.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label="End of day">
      <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MoonStar className="size-5 text-slate-500" aria-hidden />
          <h2 className="font-semibold">End of day</h2>
        </div>
        <Badge tone="neutral">
          {businessDate} · {timezone}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Figure
            label="Today's digital receipts"
            value={money(today.digitalReceiptsCents)}
            hint={`${today.digitalReceiptCount} received`}
          />
          <Figure
            label="Available in Routine"
            value={money(routine.availableCents)}
            hint={
              BigInt(routine.pendingCents) > 0n
                ? `${money(routine.pendingCents)} pending`
                : "Nothing pending"
            }
          />
          <Figure
            label="Cash recorded today"
            value={money(today.cashRecordedMinor, today.cashRecordedCurrency)}
            hint={`${today.cashRecordedCount} recorded`}
          />
        </div>

        <Alert>{cashNote}</Alert>

        <Field>
          <FieldLabel htmlFor="day-end-amount">Amount to move</FieldLabel>
          <Input
            id="day-end-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setTouched(true);
              setAmount(event.target.value);
            }}
          />
          <FieldMessage>
            Suggested {money(suggestion.amountCents)} — {suggestion.explanation}
          </FieldMessage>
        </Field>

        {error ? (
          <Alert className="border-red-200 bg-red-50 text-red-800">{error}</Alert>
        ) : null}
        {confirmation ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
            {confirmation}
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void confirm()} disabled={pending}>
            {pending ? "Moving…" : "Move to Holding"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setTouched(false);
              setAmount(centsToInput(suggestion.amountCents));
            }}
            disabled={pending}
          >
            Use the suggestion
          </Button>
        </div>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
            Already moved today
          </p>
          {previousTransfers.length ? (
            <ul className="grid gap-2 text-sm">
              {previousTransfers.map((transfer) => (
                <li
                  key={transfer.operationId}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="text-slate-700">
                    {new Intl.DateTimeFormat("en-GB", {
                      timeStyle: "short",
                      dateStyle: "medium",
                    }).format(new Date(transfer.confirmedAt))}
                    {transfer.actorUserId ? " · confirmed by a member" : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono tabular-nums text-slate-950">
                      {money(transfer.amountCents)}
                    </span>
                    <Badge
                      tone={
                        transfer.status === "finalized"
                          ? "success"
                          : transfer.status === "failed"
                            ? "danger"
                            : "info"
                      }
                    >
                      {transfer.status}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              Nothing has been moved for {businessDate} yet.
            </p>
          )}
        </div>
      </CardContent>
      </Card>
    </section>
  );
}

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-xl tabular-nums text-slate-950">
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
