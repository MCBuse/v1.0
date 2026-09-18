"use client";

import { useState } from "react";
import { Banknote, Plus, Trash2, X } from "lucide-react";
import { Alert } from "@repo/ui/alert";
import { Button } from "@repo/ui/button";
import { Field, FieldLabel, Input } from "@repo/ui/field";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { portalApi } from "@/lib/client/api";
import { euroInputToMinor } from "@/lib/client/money-input";
import { usePortalResource } from "@/lib/client/use-portal-resource";
import type { MerchantProductPage } from "@repo/shared";

type CashLine = {
  id: string;
  type: "custom" | "product";
  productId: string;
  name: string;
  amount: string;
  quantity: string;
};

const newLine = (): CashLine => ({
  id: crypto.randomUUID(),
  type: "custom",
  productId: "",
  name: "",
  amount: "",
  quantity: "1",
});

function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function RecordCashSaleDrawer() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [lines, setLines] = useState<CashLine[]>([newLine()]);
  const products = usePortalResource<MerchantProductPage>(
    "me/products?page=1&pageSize=100",
  );

  function changeLine(id: string, patch: Partial<CashLine>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  }

  function reset() {
    setError("");
    setSaved(false);
    setLines([newLine()]);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const occurredAt = new Date(String(form.get("occurredAt") || ""));
    if (Number.isNaN(occurredAt.getTime()) || occurredAt > new Date()) {
      setError("Enter a sale time that is not in the future.");
      return;
    }

    let payloadLines:
      | Array<
          | { type: "product"; productId: string; quantity: number }
          | {
              type: "custom";
              name: string;
              quantity: number;
              unitPriceMinor: string;
            }
        >
      | undefined;
    try {
      payloadLines = lines.map((line) => {
        const quantity = Number(line.quantity);
        if (!Number.isInteger(quantity) || quantity < 1) {
          throw new Error("Every line needs a whole quantity of at least one.");
        }
        if (line.type === "product") {
          if (!line.productId) {
            throw new Error("Choose a product for every inventory line.");
          }
          return { type: "product" as const, productId: line.productId, quantity };
        }
        const unitPriceMinor = euroInputToMinor(line.amount);
        if (!line.name.trim() || !unitPriceMinor) {
          throw new Error("Every custom line needs a name and unit amount.");
        }
        return {
          type: "custom" as const,
          name: line.name.trim(),
          quantity,
          unitPriceMinor,
        };
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Check each sale item.");
      return;
    }

    setSaving(true);
    try {
      const sale = await portalApi<{ id: string }>("me/cash-sales", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          occurredAt: occurredAt.toISOString(),
          description: String(form.get("description") ?? "").trim() || undefined,
          stockAlreadyAccountedFor: form.get("stockAlreadyAccountedFor") === "on",
          lines: payloadLines,
        }),
      });
      const attachment = form.get("attachment");
      if (attachment instanceof File && attachment.size) {
        const upload = new FormData();
        upload.set("file", attachment);
        try {
          await portalApi(`me/cash-sales/${sale.id}/attachment`, {
            method: "POST",
            body: upload,
          });
        } catch (reason) {
          setError(
            `Cash sale was recorded, but its support document could not be attached: ${reason instanceof Error ? reason.message : "unknown error"}`,
          );
          setSaved(true);
          return;
        }
      }
      setSaved(true);
      window.dispatchEvent(new Event("merchant:refresh"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not record cash sale.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      direction="right"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DrawerTrigger asChild>
        <Button variant="secondary"><Banknote data-icon="inline-start" />Record cash sale</Button>
      </DrawerTrigger>
      <DrawerContent className="h-dvh w-full overflow-hidden rounded-none sm:max-w-lg">
        <DrawerHeader className="relative border-b border-slate-200 pr-16">
          <DrawerTitle>Record cash sale</DrawerTitle>
          <DrawerDescription>
            Cash is merchant-declared. It contributes to recorded activity, never to wallet balances or verified-payment counts.
          </DrawerDescription>
          <DrawerClose asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close cash sale drawer" className="absolute right-3 top-3"><X /></Button>
          </DrawerClose>
        </DrawerHeader>
        {saved ? (
          <div className="grid gap-4 p-6">
            {error ? <Alert className="border-amber-200 bg-amber-50 text-amber-900">{error}</Alert> : <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">Cash sale recorded. It is now visible in analytics as merchant-recorded cash.</Alert>}
          </div>
        ) : (
          <form className="grid gap-5 overflow-y-auto p-6" onSubmit={submit}>
            {error ? <Alert className="border-red-200 bg-red-50 text-red-800">{error}</Alert> : null}
            <div className="grid gap-4">
              {lines.map((line, index) => (
                <div key={line.id} className="grid gap-3 rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-900">Sale item {index + 1}</p>{lines.length > 1 ? <Button type="button" variant="ghost" size="sm" aria-label={`Remove sale item ${index + 1}`} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}><Trash2 data-icon="inline-start" />Remove</Button> : null}</div>
                  <Field><FieldLabel htmlFor={`cash-type-${line.id}`}>Item type</FieldLabel><select id={`cash-type-${line.id}`} value={line.type} onChange={(event) => changeLine(line.id, { type: event.target.value as CashLine["type"], productId: "", name: "", amount: "" })} className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="custom">Custom item</option><option value="product">Inventory product</option></select></Field>
                  {line.type === "product" ? <Field><FieldLabel htmlFor={`cash-product-${line.id}`}>Product</FieldLabel><select id={`cash-product-${line.id}`} value={line.productId} onChange={(event) => changeLine(line.id, { productId: event.target.value })} className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Choose a product</option>{products.data?.items.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name} ({item.availableQuantity} available)</option>)}</select></Field> : <div className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor={`cash-name-${line.id}`}>Item</FieldLabel><Input id={`cash-name-${line.id}`} value={line.name} onChange={(event) => changeLine(line.id, { name: event.target.value })} maxLength={160} /></Field><Field><FieldLabel htmlFor={`cash-amount-${line.id}`}>Unit amount (EUR)</FieldLabel><Input id={`cash-amount-${line.id}`} value={line.amount} onChange={(event) => changeLine(line.id, { amount: event.target.value })} inputMode="decimal" placeholder="0.00" /></Field></div>}
                  <Field><FieldLabel htmlFor={`cash-quantity-${line.id}`}>Quantity</FieldLabel><Input id={`cash-quantity-${line.id}`} value={line.quantity} onChange={(event) => changeLine(line.id, { quantity: event.target.value })} type="number" min="1" step="1" /></Field>
                </div>
              ))}
            </div>
            <Button type="button" variant="secondary" onClick={() => setLines((current) => current.length < 50 ? [...current, newLine()] : current)} disabled={lines.length >= 50}><Plus data-icon="inline-start" />Add another item</Button>
            <Field><FieldLabel htmlFor="cash-occurred-at">Sale date and time</FieldLabel><Input id="cash-occurred-at" name="occurredAt" type="datetime-local" defaultValue={localDateTimeValue()} max={localDateTimeValue()} required /></Field>
            <label className="flex items-start gap-2 text-xs text-slate-600"><input name="stockAlreadyAccountedFor" type="checkbox" className="mt-0.5" />Stock was already adjusted elsewhere. This records the sale without deducting product stock.</label>
            <Field><FieldLabel htmlFor="cash-description">Note (optional)</FieldLabel><Input id="cash-description" name="description" maxLength={140} /></Field>
            <Field><FieldLabel htmlFor="cash-attachment">Support document (optional)</FieldLabel><Input id="cash-attachment" name="attachment" type="file" accept="image/jpeg,image/png,application/pdf" /><p className="mt-1 text-xs text-slate-500">JPEG, PNG, or PDF only, up to 5 MB. Stored privately.</p></Field>
            <Button type="submit" disabled={saving}>{saving ? "Recording…" : "Record cash sale"}</Button>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  );
}
