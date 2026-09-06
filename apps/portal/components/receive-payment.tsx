"use client";

import type { MerchantPaymentRequest } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Field, FieldLabel, FieldMessage, Input } from "@repo/ui/field";
import { formatMoney } from "@repo/ui/money";
import { CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { portalApi } from "@/lib/client/api";
import { euroInputToMinor } from "@/lib/client/money-input";

export function ReceivePayment({ compact = false }: { compact?: boolean }) {
  const [request, setRequest] = useState<MerchantPaymentRequest | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!request || !["pending", "processing"].includes(request.status)) return;
    const poll = window.setInterval(async () => {
      try {
        const next = await portalApi<MerchantPaymentRequest>(
          `me/payment-requests/${request.id}`,
        );
        setRequest(next);
        if (next.status === "completed")
          window.dispatchEvent(new Event("merchant:refresh"));
      } catch {
        // Keep the current QR visible. A later poll can recover a temporary outage.
      }
    }, 2_500);
    return () => window.clearInterval(poll);
  }, [request]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const amountMinor = euroInputToMinor(String(form.get("amount") ?? ""));
    if (!amountMinor) {
      setError("Enter a valid euro amount with up to two decimal places.");
      setPending(false);
      return;
    }
    try {
      const created = await portalApi<MerchantPaymentRequest>(
        "me/payment-requests",
        {
          method: "POST",
          body: JSON.stringify({
            amountMinor,
            description:
              String(form.get("description") ?? "").trim() || undefined,
          }),
        },
      );
      setRequest(created);
      window.dispatchEvent(new Event("merchant:refresh"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not create the request",
      );
    } finally {
      setPending(false);
    }
  }

  if (request) {
    const completed = request.status === "completed";
    const inactive = ["expired", "cancelled", "failed"].includes(
      request.status,
    );
    return (
      <div className="grid gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-slate-500">
            Payment request
          </p>
          <p className="mt-2 font-mono text-3xl font-medium tracking-tight text-slate-950">
            {formatMoney(request.amount)}
          </p>
          {request.description ? (
            <p className="mt-1 text-sm text-slate-500">{request.description}</p>
          ) : null}
        </div>
        {completed ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
            <span className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={18} />
              Payment received
            </span>
          </Alert>
        ) : inactive ? (
          <Alert className="border-amber-200 bg-amber-50 text-amber-900">
            This request is {request.status}. Create a new one to continue.
          </Alert>
        ) : (
          <>
            <div className="mx-auto rounded-xl border border-slate-200 bg-white p-4">
              <QRCodeSVG
                value={request.qrPayload}
                size={compact ? 180 : 220}
                level="M"
                marginSize={1}
                aria-label="Payment request QR code"
              />
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <RefreshCw className="animate-spin" size={15} />
              <span>
                {request.status === "processing"
                  ? "Payment is finalizing…"
                  : "Waiting for customer payment…"}
              </span>
            </div>
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <Clock3 size={13} />
              Expires{" "}
              {new Intl.DateTimeFormat("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(request.expiresAt))}
            </p>
          </>
        )}
        <Button
          variant={completed ? "primary" : "secondary"}
          onClick={() => setRequest(null)}
        >
          Create another request
        </Button>
      </div>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={create}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.12em] text-blue-700">
          Receive payment
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">
          Create a request
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Enter the sale in euros. Your customer scans and approves it in
          MCBuse.
        </p>
      </div>
      {error ? (
        <Alert className="border-red-200 bg-red-50 text-red-800">{error}</Alert>
      ) : null}
      <Field>
        <FieldLabel htmlFor={compact ? "amount-mobile" : "amount-desktop"}>
          Amount
        </FieldLabel>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-slate-500">
            €
          </span>
          <Input
            id={compact ? "amount-mobile" : "amount-desktop"}
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            className="pl-8 font-mono text-lg"
            required
          />
        </div>
        <FieldMessage>EUR, up to two decimal places</FieldMessage>
      </Field>
      <Field>
        <FieldLabel
          htmlFor={compact ? "description-mobile" : "description-desktop"}
        >
          Description{" "}
          <span className="font-normal text-slate-400">optional</span>
        </FieldLabel>
        <Input
          id={compact ? "description-mobile" : "description-desktop"}
          name="description"
          maxLength={140}
          placeholder="Counter sale"
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating…" : "Create payment request"}
      </Button>
      <Badge tone="info" className="w-fit">
        Updates automatically after payment
      </Badge>
    </form>
  );
}
