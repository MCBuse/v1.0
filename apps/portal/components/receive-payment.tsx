"use client";

import type { MerchantPaymentRequest } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Field, FieldLabel, FieldMessage, Input } from "@repo/ui/field";
import { formatMoney } from "@repo/ui/money";
import {
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  RefreshCw,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { portalApi } from "@/lib/client/api";
import { euroInputToMinor } from "@/lib/client/money-input";

export function ReceivePaymentDrawer() {
  const [open, setOpen] = useState(false);
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
        if (next.status === "completed") {
          window.dispatchEvent(new Event("merchant:refresh"));
        }
      } catch {
        // Keep the QR available while a later poll recovers a temporary outage.
      }
    }, 2_500);

    return () => window.clearInterval(poll);
  }, [request]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen && !request) setError("");
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const amountMinor = euroInputToMinor(String(form.get("amount") ?? ""));

    if (!amountMinor) {
      setError("Enter a valid euro amount with up to two decimal places.");
      setPending(false);
      const amount = event.currentTarget.elements.namedItem("amount");
      if (amount instanceof HTMLInputElement) amount.focus();
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
          : "Could not create the request.",
      );
    } finally {
      setPending(false);
    }
  }

  function createAnother() {
    setRequest(null);
    setError("");
  }

  const completed = request?.status === "completed";
  const inactive = request
    ? ["expired", "cancelled", "failed"].includes(request.status)
    : false;

  return (
    <Drawer direction="right" open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <Button>
          <CircleDollarSign data-icon="inline-start" aria-hidden="true" />
          Create request
        </Button>
      </DrawerTrigger>
      <DrawerContent className="h-dvh w-full overflow-hidden rounded-none sm:max-w-md">
        <DrawerHeader className="relative border-b border-slate-200 pr-16">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-blue-700">
            Receive payment
          </p>
          <DrawerTitle className="text-xl font-semibold text-slate-950">
            {request ? "Payment request" : "Create a request"}
          </DrawerTitle>
          <DrawerDescription className="leading-6 text-slate-500">
            {request
              ? "Keep this request open while your customer completes payment."
              : "Enter the sale in euros. Your customer scans and approves it in MCBuse."}
          </DrawerDescription>
          <DrawerClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close payment request drawer"
              className="absolute right-3 top-3"
            >
              <X aria-hidden="true" />
            </Button>
          </DrawerClose>
        </DrawerHeader>

        {request ? (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
              <div>
                <p className="font-mono text-3xl font-medium tracking-tight text-slate-950">
                  {formatMoney(request.amount)}
                </p>
                {request.description ? (
                  <p className="mt-1 text-sm text-slate-500">
                    {request.description}
                  </p>
                ) : null}
              </div>

              {completed ? (
                <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
                  <span className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 aria-hidden="true" />
                    Payment received
                  </span>
                </Alert>
              ) : inactive ? (
                <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                  This request is {request.status}. Create a new one to
                  continue.
                </Alert>
              ) : (
                <>
                  <div className="mx-auto rounded-xl border border-slate-200 bg-white p-4">
                    <QRCodeSVG
                      value={request.qrPayload}
                      size={220}
                      level="M"
                      marginSize={1}
                      aria-label="Payment request QR code"
                    />
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                    <RefreshCw
                      className="animate-spin"
                      size={15}
                      aria-hidden="true"
                    />
                    <span>
                      {request.status === "processing"
                        ? "Payment is finalizing…"
                        : "Waiting for customer payment…"}
                    </span>
                  </div>
                  <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                    <Clock3 size={13} aria-hidden="true" />
                    Expires{" "}
                    {new Intl.DateTimeFormat("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(request.expiresAt))}
                  </p>
                </>
              )}
            </div>
            <DrawerFooter className="border-t border-slate-200">
              <Button
                variant={completed ? "primary" : "secondary"}
                onClick={createAnother}
              >
                Create another request
              </Button>
            </DrawerFooter>
          </>
        ) : (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={create}>
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
              {error ? (
                <Alert
                  id="receive-payment-error"
                  className="border-red-200 bg-red-50 text-red-800"
                >
                  {error}
                </Alert>
              ) : null}
              <Field data-invalid={error ? "true" : undefined}>
                <FieldLabel htmlFor="receive-amount">Amount</FieldLabel>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-slate-500">
                    €
                  </span>
                  <Input
                    id="receive-amount"
                    name="amount"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    className="pl-8 font-mono text-lg"
                    required
                    aria-invalid={error ? "true" : undefined}
                    aria-describedby={
                      error
                        ? "receive-payment-error"
                        : "receive-payment-amount-hint"
                    }
                  />
                </div>
                <FieldMessage id="receive-payment-amount-hint">
                  EUR, up to two decimal places
                </FieldMessage>
              </Field>
              <Field>
                <FieldLabel htmlFor="receive-description">
                  Description{" "}
                  <span className="font-normal text-slate-500">optional</span>
                </FieldLabel>
                <Input
                  id="receive-description"
                  name="description"
                  maxLength={140}
                  autoComplete="off"
                  placeholder="Counter sale"
                />
              </Field>
              <Badge tone="info" className="w-fit">
                Updates automatically after payment
              </Badge>
            </div>
            <DrawerFooter className="border-t border-slate-200">
              <Button
                type="submit"
                size="lg"
                disabled={pending}
                aria-busy={pending}
              >
                {pending ? "Creating…" : "Create payment request"}
              </Button>
              <DrawerClose asChild>
                <Button type="button" variant="ghost" disabled={pending}>
                  Cancel
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  );
}
