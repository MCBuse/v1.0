"use client";

import type { LiveConnectionStatus } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { MonitorSmartphone, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { portalApi } from "@/lib/client/api";
import { useMerchantEvents } from "@/lib/client/use-merchant-events";

const STATUS: Record<
  LiveConnectionStatus,
  { label: string; tone: "success" | "info" | "warning" | "danger"; hint: string }
> = {
  connecting: {
    label: "Connecting",
    tone: "info",
    hint: "Opening the live connection to your devices.",
  },
  live: {
    label: "Live",
    tone: "success",
    hint: "Changes appear on every signed-in device as they happen.",
  },
  reconnecting: {
    label: "Reconnecting",
    tone: "warning",
    hint: "The live connection dropped. Nothing is lost; it resumes from where it stopped.",
  },
  polling: {
    label: "Checking every few seconds",
    tone: "warning",
    hint: "The live connection is unavailable here, so updates arrive a few seconds late.",
  },
  offline: {
    label: "Offline",
    tone: "danger",
    hint: "This device has no connection. Updates resume when it returns.",
  },
};

function euros(minor: string | null, currency = "EUR") {
  if (minor === null) return "—";
  const digits = minor.padStart(3, "0");
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(`${digits.slice(0, -2)}.${digits.slice(-2)}`));
}

/**
 * Q.4, Q.6, Q.8 and Q.10 — what the counter is showing, and whether this
 * screen can be trusted to be current.
 *
 * The presented request is server-side state, so every signed-in device shows
 * the same thing. The connection badge is deliberately prominent: a merchant
 * reading a stale screen while a customer waits is the failure this prevents.
 */
export function CounterDisplay() {
  const { status, presented, setPresented } = useMerchantEvents();
  const [clearing, setClearing] = useState(false);
  const descriptor = STATUS[status];

  async function clear() {
    setClearing(true);
    try {
      await portalApi("me/presented-request", { method: "DELETE" });
      setPresented(null);
    } catch {
      // The stream will correct this if the delete actually landed.
    } finally {
      setClearing(false);
    }
  }

  return (
    <section aria-label="Counter display">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MonitorSmartphone className="size-5 text-slate-500" aria-hidden />
            <h2 className="font-semibold">On the counter</h2>
          </div>
          <Badge tone={descriptor.tone} aria-live="polite">
            {descriptor.label}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-xs text-slate-500">{descriptor.hint}</p>

          {presented ? (
            <div className="grid gap-4 sm:grid-cols-[auto,1fr] sm:items-start">
              <div className="mx-auto rounded-xl border border-slate-200 bg-white p-3 sm:mx-0">
                <QRCodeSVG
                  value={presented.nonce}
                  size={160}
                  level="M"
                  marginSize={1}
                  aria-label="Presented payment request QR code"
                />
              </div>
              <div className="grid gap-2">
                <p className="font-mono text-2xl tabular-nums text-slate-950">
                  {euros(presented.displayAmountMinor, presented.displayCurrency)}
                </p>
                {presented.invoiceNumber ? (
                  <p className="text-sm font-medium text-blue-700">
                    {presented.invoiceNumber} · {presented.lines.length} line
                    {presented.lines.length === 1 ? "" : "s"}
                  </p>
                ) : null}
                {presented.description ? (
                  <p className="text-sm text-slate-600">
                    {presented.description}
                  </p>
                ) : null}
                <p className="text-sm">
                  <Badge
                    tone={
                      presented.status === "completed"
                        ? "success"
                        : presented.status === "pending" ||
                            presented.status === "processing"
                          ? "info"
                          : "neutral"
                    }
                  >
                    {presented.status}
                  </Badge>
                </p>
                <p className="text-xs text-slate-500">
                  Presented{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(presented.presentedAt))}
                </p>
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void clear()}
                    disabled={clearing}
                  >
                    <X className="size-4" aria-hidden />
                    {clearing ? "Clearing…" : "Clear the counter"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Alert>
              Nothing is on the counter. Present a payment request and it
              appears here and on every other signed-in device.
            </Alert>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
