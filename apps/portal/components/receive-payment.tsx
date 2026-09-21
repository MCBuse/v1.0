"use client";

import type {
  MerchantInvoice,
  MerchantPaymentRequest,
  MerchantProductPage,
} from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Field, FieldLabel, FieldMessage, Input } from "@repo/ui/field";
import { formatMoney } from "@repo/ui/money";
import {
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Minus,
  Plus,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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
import { usePortalResource } from "@/lib/client/use-portal-resource";

type Request = MerchantPaymentRequest | MerchantInvoice;
type DraftLine =
  | { id: string; type: "product"; productId: string; quantity: number }
  | { id: string; type: "custom"; name: string; quantity: number; price: string };

function isInvoice(value: Request): value is MerchantInvoice {
  return "invoiceNumber" in value;
}

/**
 * Q.1 — the same drawer, opened from a product.
 *
 * `preloadProductIds` starts it on the itemised tab with those products
 * already as lines, so "Create invoice / QR" on a catalogue row lands the
 * merchant in the flow rather than at the beginning of it. In controlled mode
 * the caller owns `open`, which is how the inventory page keeps one drawer for
 * a whole table of products.
 */
export function ReceivePaymentDrawer({
  open: controlledOpen,
  onOpenChange,
  preloadProductIds,
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  preloadProductIds?: string[];
  trigger?: ReactNode;
} = {}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [request, setRequest] = useState<Request | null>(null);
  const [mode, setMode] = useState<"quick" | "itemised">("quick");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [invoiceDescription, setInvoiceDescription] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const products = usePortalResource<MerchantProductPage>(
    "me/products?status=active&page=1&pageSize=100",
    60_000,
  );
  const productById = useMemo(
    () => new Map((products.data?.items ?? []).map((product) => [product.id, product])),
    [products.data],
  );
  const itemisedTotal = lines.reduce((total, line) => {
    if (line.type === "product") {
      const product = productById.get(line.productId);
      return total + (product ? BigInt(product.unitPrice.minor) * BigInt(line.quantity) : 0n);
    }
    return total + BigInt(euroInputToMinor(line.price) || "0") * BigInt(line.quantity);
  }, 0n);

  const preloadKey = (preloadProductIds ?? []).join(",");
  useEffect(() => {
    if (!open || !preloadKey) return;
    // Seeding happens on open rather than on every render, so a merchant who
    // edits the preloaded lines does not have their edits overwritten.
    setRequest(null);
    setError("");
    setMode("itemised");
    setLines(
      preloadKey.split(",").map((productId) => ({
        id: crypto.randomUUID(),
        type: "product" as const,
        productId,
        quantity: 1,
      })),
    );
  }, [open, preloadKey]);

  useEffect(() => {
    if (!request || !["pending", "processing"].includes(request.status)) return;
    const path = isInvoice(request)
      ? `me/invoices/${request.id}`
      : `me/payment-requests/${request.id}`;
    const poll = window.setInterval(async () => {
      try {
        const next = await portalApi<Request>(path);
        setRequest(next);
        if (next.status === "completed") window.dispatchEvent(new Event("merchant:refresh"));
      } catch {
        // Keep the QR visible while a later poll recovers a temporary outage.
      }
    }, 2_500);
    return () => window.clearInterval(poll);
  }, [request]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen && !request) setError("");
  }

  function updateLine(id: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } as DraftLine : line));
  }

  function addProductLine() {
    const product = products.data?.items.find((item) => item.availableQuantity > 0);
    if (!product) {
      setError("Add an active product with available stock before creating an itemised request.");
      return;
    }
    setLines((current) => current.length < 50 ? [...current, { id: crypto.randomUUID(), type: "product", productId: product.id, quantity: 1 }] : current);
  }

  function addCustomLine() {
    setLines((current) => current.length < 50 ? [...current, { id: crypto.randomUUID(), type: "custom", name: "", quantity: 1, price: "" }] : current);
  }

  async function createQuickRequest(event: React.FormEvent<HTMLFormElement>) {
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
      const created = await portalApi<MerchantPaymentRequest>("me/payment-requests", {
        method: "POST",
        body: JSON.stringify({
          amountMinor,
          description: String(form.get("description") ?? "").trim() || undefined,
        }),
      });
      setRequest(created);
      window.dispatchEvent(new Event("merchant:refresh"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the request.");
    } finally {
      setPending(false);
    }
  }

  async function createItemisedRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lines.length) {
      setError("Add at least one product or custom line.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const payload = lines.map((line) => line.type === "product"
        ? ({ type: "product", productId: line.productId, quantity: line.quantity })
        : ({ type: "custom", name: line.name.trim(), quantity: line.quantity, unitPriceMinor: euroInputToMinor(line.price) }));
      if (payload.some((line) => line.type === "custom" && (!line.name || !line.unitPriceMinor))) {
        throw new Error("Each custom line needs a name and valid EUR unit price.");
      }
      const created = await portalApi<MerchantInvoice>("me/invoices", {
        method: "POST",
        body: JSON.stringify({
          lines: payload,
          description: invoiceDescription.trim() || undefined,
          expiresInSeconds: 3600,
        }),
      });
      setRequest(created);
      setLines([]);
      setInvoiceDescription("");
      window.dispatchEvent(new Event("merchant:refresh"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the itemised request.");
    } finally {
      setPending(false);
    }
  }

  function createAnother() {
    setRequest(null);
    setError("");
    setLines([]);
    setInvoiceDescription("");
    setMode("quick");
  }

  const completed = request?.status === "completed";
  const inactive = request ? ["expired", "cancelled", "failed"].includes(request.status) : false;

  return (
    <Drawer direction="right" open={open} onOpenChange={handleOpenChange}>
      {controlled ? null : (
        <DrawerTrigger asChild>
          {trigger ?? (
            <Button>
              <CircleDollarSign data-icon="inline-start" aria-hidden="true" />
              Create request
            </Button>
          )}
        </DrawerTrigger>
      )}
      <DrawerContent className="h-dvh w-full overflow-hidden rounded-none sm:max-w-md">
        <DrawerHeader className="relative border-b border-slate-200 pr-16">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-blue-700">Receive payment</p>
          <DrawerTitle className="text-xl font-semibold text-slate-950">{request ? "Payment request" : "Create a request"}</DrawerTitle>
          <DrawerDescription className="leading-6 text-slate-500">{request ? "Keep this request open while your customer completes payment." : "Choose a fast amount request or an itemised sale with stock reservations."}</DrawerDescription>
          <DrawerClose asChild><Button type="button" variant="ghost" size="icon" aria-label="Close payment request drawer" className="absolute right-3 top-3"><X aria-hidden="true" /></Button></DrawerClose>
        </DrawerHeader>
        {request ? (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
              <div><p className="font-mono text-3xl font-medium tracking-tight text-slate-950">{formatMoney(request.amount)}</p>{request.description ? <p className="mt-1 text-sm text-slate-500">{request.description}</p> : null}{isInvoice(request) ? <p className="mt-1 text-xs font-medium text-blue-700">{request.invoiceNumber} · {request.lines.length} itemised line{request.lines.length === 1 ? "" : "s"}</p> : null}</div>
              {completed ? <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800"><span className="flex items-center gap-2 font-semibold"><CheckCircle2 aria-hidden="true" />Payment received</span></Alert> : inactive ? <Alert className="border-amber-200 bg-amber-50 text-amber-900">This request is {request.status}. Create a new one to continue.</Alert> : <><div className="mx-auto rounded-xl border border-slate-200 bg-white p-4"><QRCodeSVG value={request.qrPayload} size={220} level="M" marginSize={1} aria-label="Payment request QR code" /></div><div className="flex items-center justify-center gap-2 text-sm text-slate-500"><RefreshCw className="animate-spin" size={15} aria-hidden="true" /><span>{request.status === "processing" ? "Payment is finalizing…" : "Waiting for customer payment…"}</span></div><p className="flex items-center justify-center gap-1.5 text-xs text-slate-500"><Clock3 size={13} aria-hidden="true" />Expires {new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(request.expiresAt))}</p></>}
            </div>
            <DrawerFooter className="border-t border-slate-200"><Button variant={completed ? "primary" : "secondary"} onClick={createAnother}>Create another request</Button></DrawerFooter>
          </>
        ) : (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={mode === "quick" ? createQuickRequest : createItemisedRequest}>
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
              {error ? <Alert id="receive-payment-error" className="border-red-200 bg-red-50 text-red-800">{error}</Alert> : null}
              <div className="grid grid-cols-2 gap-2"><Button type="button" size="sm" variant={mode === "quick" ? "primary" : "secondary"} onClick={() => { setMode("quick"); setError(""); }}>Quick amount</Button><Button type="button" size="sm" variant={mode === "itemised" ? "primary" : "secondary"} onClick={() => { setMode("itemised"); setError(""); }}>Itemised sale</Button></div>
              {mode === "quick" ? <><Field data-invalid={error ? "true" : undefined}><FieldLabel htmlFor="receive-amount">Amount</FieldLabel><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-slate-500">€</span><Input id="receive-amount" name="amount" inputMode="decimal" autoComplete="off" placeholder="0.00" className="pl-8 font-mono text-lg" required aria-invalid={error ? "true" : undefined} aria-describedby={error ? "receive-payment-error" : "receive-payment-amount-hint"} /></div><FieldMessage id="receive-payment-amount-hint">EUR, up to two decimal places</FieldMessage></Field><Field><FieldLabel htmlFor="receive-description">Description <span className="font-normal text-slate-500">optional</span></FieldLabel><Input id="receive-description" name="description" maxLength={140} autoComplete="off" placeholder="Counter sale" /></Field></> : <><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" onClick={addProductLine} disabled={lines.length >= 50}><Plus data-icon="inline-start" />Product</Button><Button type="button" size="sm" variant="secondary" onClick={addCustomLine} disabled={lines.length >= 50}><Plus data-icon="inline-start" />Custom line</Button></div>{lines.map((line) => <div key={line.id} className="grid gap-3 rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between"><Badge tone={line.type === "product" ? "info" : "neutral"}>{line.type === "product" ? "Product" : "Custom"}</Badge><Button type="button" size="sm" variant="ghost" aria-label="Remove invoice line" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}><XCircle size={17} /></Button></div>{line.type === "product" ? <select aria-label="Product" value={line.productId} onChange={(event) => updateLine(line.id, { productId: event.target.value })} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"><option value="">Choose a product</option>{products.data?.items.map((product) => <option key={product.id} value={product.id} disabled={product.availableQuantity === 0}>{product.name} · €{(Number(product.unitPrice.minor) / 100).toFixed(2)} · {product.availableQuantity} available</option>)}</select> : <><Input aria-label="Custom line name" value={line.name} onChange={(event) => updateLine(line.id, { name: event.target.value })} placeholder="Line item name" /><Input aria-label="Custom line price" inputMode="decimal" value={line.price} onChange={(event) => updateLine(line.id, { price: event.target.value })} placeholder="Unit price in EUR" /></>}<div className="flex items-center gap-2"><Button type="button" variant="secondary" size="icon" aria-label="Decrease quantity" disabled={line.quantity <= 1} onClick={() => updateLine(line.id, { quantity: line.quantity - 1 })}><Minus size={16} /></Button><span className="min-w-8 text-center font-mono text-sm">{line.quantity}</span><Button type="button" variant="secondary" size="icon" aria-label="Increase quantity" onClick={() => updateLine(line.id, { quantity: line.quantity + 1 })}><Plus size={16} /></Button></div></div>)}<Field><FieldLabel htmlFor="itemised-description">Note <span className="font-normal text-slate-500">optional</span></FieldLabel><Input id="itemised-description" value={invoiceDescription} onChange={(event) => setInvoiceDescription(event.target.value)} maxLength={140} placeholder="Counter sale" /></Field><div className="flex items-baseline justify-between border-t border-slate-200 pt-4"><span className="text-sm text-slate-500">Invoice total</span><span className="font-mono text-xl font-semibold text-slate-950">€{(Number(itemisedTotal) / 100).toFixed(2)}</span></div><p className="text-xs text-slate-500">Stock is reserved until payment, cancellation, or expiry.</p></>}
              <Badge tone="info" className="w-fit">Updates automatically after payment</Badge>
            </div>
            <DrawerFooter className="border-t border-slate-200"><Button type="submit" size="lg" disabled={pending || (mode === "itemised" && !lines.length)} aria-busy={pending}>{pending ? "Creating…" : mode === "quick" ? "Create payment request" : "Create itemised request"}</Button><DrawerClose asChild><Button type="button" variant="ghost" disabled={pending}>Cancel</Button></DrawerClose></DrawerFooter>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  );
}
