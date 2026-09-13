"use client";

import type { MerchantInvoice, MerchantInvoicePage, MerchantProduct, MerchantProductPage } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { EmptyState, ErrorState } from "@repo/ui/empty-state";
import { Field, FieldLabel, FieldMessage, Input } from "@repo/ui/field";
import { Money } from "@repo/ui/money";
import { Skeleton } from "@repo/ui/skeleton";
import { CheckCircle2, CircleDollarSign, Clock3, Minus, Plus, ReceiptText, XCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { portalApi } from "@/lib/client/api";
import { euroInputToMinor } from "@/lib/client/money-input";
import { usePortalResource } from "@/lib/client/use-portal-resource";

type DraftLine =
  | { id: string; type: "product"; productId: string; quantity: number }
  | { id: string; type: "custom"; name: string; quantity: number; price: string };

function statusTone(status: MerchantInvoice["status"]): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "completed") return "success";
  if (status === "pending" || status === "processing") return "warning";
  if (status === "failed") return "danger";
  if (status === "expired") return "neutral";
  return "info";
}

function statusLabel(status: MerchantInvoice["status"]) {
  return status === "completed" ? "Paid" : status === "pending" ? "Awaiting payment" : `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

export function InvoicesView() {
  const [history, setHistory] = useState(false);
  const invoices = usePortalResource<MerchantInvoicePage>(`me/invoices?status=${history ? "history" : "open"}&page=1&pageSize=50`, 10_000);
  const products = usePortalResource<MerchantProductPage>("me/products?status=active&page=1&pageSize=100", 60_000);
  const [selected, setSelected] = useState<MerchantInvoice | null>(null);
  const [creating, setCreating] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [description, setDescription] = useState("");
  const [expiresInSeconds, setExpiresInSeconds] = useState<900 | 3600 | 86400>(3600);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!selected || !["pending", "processing"].includes(selected.status)) return;
    const timer = window.setInterval(() => {
      void portalApi<MerchantInvoice>(`me/invoices/${selected.id}`).then(setSelected).catch(() => undefined);
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [selected]);

  const productById = useMemo(() => new Map((products.data?.items ?? []).map((product) => [product.id, product])), [products.data]);
  const displayed = (invoices.data?.items ?? []).filter((invoice) => !query.trim() || invoice.invoiceNumber.toLowerCase().includes(query.trim().toLowerCase()) || invoice.description?.toLowerCase().includes(query.trim().toLowerCase()));
  const totalMinor = lines.reduce((total, line) => {
    if (line.type === "product") {
      const product = productById.get(line.productId);
      return total + (product ? BigInt(product.unitPrice.minor) * BigInt(line.quantity) : 0n);
    }
    const price = euroInputToMinor(line.price);
    return total + BigInt(price || "0") * BigInt(line.quantity);
  }, 0n);

  function newProductLine() {
    const product = products.data?.items[0];
    if (!product) { setError("Add an active product before creating a product invoice line."); return; }
    setLines((current) => [...current, { id: crypto.randomUUID(), type: "product", productId: product.id, quantity: 1 }]);
  }

  function newCustomLine() {
    setLines((current) => [...current, { id: crypto.randomUUID(), type: "custom", name: "", quantity: 1, price: "" }]);
  }

  async function createInvoice() {
    if (!lines.length) { setError("Add at least one product or custom line."); return; }
    setSaving(true); setError("");
    try {
      const payload = lines.map((line) => line.type === "product" ? ({ type: "product", productId: line.productId, quantity: line.quantity }) : ({ type: "custom", name: line.name.trim(), quantity: line.quantity, unitPriceMinor: euroInputToMinor(line.price) }));
      if (payload.some((line) => line.type === "custom" && (!line.name || !line.unitPriceMinor))) throw new Error("Each custom line needs a name and valid EUR unit price.");
      const invoice = await portalApi<MerchantInvoice>("me/invoices", { method: "POST", body: JSON.stringify({ lines: payload, description: description.trim() || undefined, expiresInSeconds }) });
      setSelected(invoice); setCreating(false); setLines([]); setDescription("");
      await invoices.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Invoice could not be created."); } finally { setSaving(false); }
  }

  async function cancelInvoice() {
    if (!selected) return;
    setSaving(true); setError("");
    try { setSelected(await portalApi<MerchantInvoice>(`me/invoices/${selected.id}/cancel`, { method: "POST" })); await invoices.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Invoice could not be cancelled."); }
    finally { setSaving(false); }
  }

  if (invoices.loading && !invoices.data) return <Skeleton className="h-[40rem]" />;
  if (invoices.error && !invoices.data) return <ErrorState retry={<Button onClick={() => void invoices.refresh()}>Try again</Button>} />;

  return <div className="grid gap-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-blue-700">Invoices</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Itemised payments</h1><p className="mt-2 text-sm text-slate-500">Create a QR invoice from inventory or a custom line.</p></div><Button onClick={() => { setCreating(true); setSelected(null); setError(""); }}><CircleDollarSign size={18} aria-hidden="true" /> New invoice</Button></div>
    {error ? <Alert className="border-red-200 bg-red-50 text-red-800">{error}</Alert> : null}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
      <Card className="overflow-hidden"><CardHeader><div className="flex w-full flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-950">{history ? "Invoice history" : "Open invoices"}</h2><p className="mt-1 text-sm text-slate-500">{history ? "Completed and inactive invoices." : "Invoices that can still be paid."}</p></div><div className="flex gap-2"><Button size="sm" variant={history ? "secondary" : "primary"} onClick={() => setHistory(false)}>Open</Button><Button size="sm" variant={history ? "primary" : "secondary"} onClick={() => setHistory(true)}>History</Button></div></div></CardHeader><CardContent className="px-0 pb-0"><div className="border-b border-slate-100 px-5 pb-4"><Input type="search" aria-label="Search invoices" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoice number or note" /></div>{displayed.length ? <div className="divide-y divide-slate-100">{displayed.map((invoice) => <button key={invoice.id} type="button" onClick={() => { setSelected(invoice); setCreating(false); }} className="flex w-full items-center gap-4 p-5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"><ReceiptText className="shrink-0 text-slate-400" size={21} aria-hidden="true" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-semibold text-slate-950">{invoice.invoiceNumber}</span><Badge tone={statusTone(invoice.status)}>{statusLabel(invoice.status)}</Badge></div><p className="mt-1 truncate text-sm text-slate-500">{invoice.description || `${invoice.lines.length} line${invoice.lines.length === 1 ? "" : "s"}`}</p></div><div className="text-right"><Money value={invoice.amount} className="font-semibold text-slate-950" /><p className="mt-1 text-xs text-slate-400">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(invoice.createdAt))}</p></div></button>)}</div> : <EmptyState title={history ? "No invoice history" : "No open invoices"} description={history ? "Paid, expired, and cancelled invoices will appear here." : "Create an itemised invoice when you are ready to receive payment."} action={!history ? <Button onClick={() => setCreating(true)}>New invoice</Button> : undefined} />}</CardContent></Card>
      <Card className="h-fit"><CardHeader><div><h2 className="font-semibold text-slate-950">{creating ? "New invoice" : selected ? selected.invoiceNumber : "Invoice details"}</h2><p className="mt-1 text-sm text-slate-500">{creating ? "Only active inventory products can be added." : selected ? statusLabel(selected.status) : "Select an invoice or create a new one."}</p></div></CardHeader><CardContent>{creating ? <InvoiceComposer products={products.data?.items ?? []} lines={lines} setLines={setLines} addProduct={newProductLine} addCustom={newCustomLine} description={description} setDescription={setDescription} expiresInSeconds={expiresInSeconds} setExpiresInSeconds={setExpiresInSeconds} totalMinor={totalMinor} saving={saving} onCreate={() => void createInvoice()} onCancel={() => { setCreating(false); setLines([]); }} /> : selected ? <InvoiceDetail invoice={selected} saving={saving} onCancel={() => void cancelInvoice()} /> : <EmptyState title="Choose an invoice" description="Its QR code and payment status will appear here." />}</CardContent></Card>
    </div>
  </div>;
}

function InvoiceComposer(props: { products: MerchantProduct[]; lines: DraftLine[]; setLines: React.Dispatch<React.SetStateAction<DraftLine[]>>; addProduct: () => void; addCustom: () => void; description: string; setDescription: (value: string) => void; expiresInSeconds: 900 | 3600 | 86400; setExpiresInSeconds: (value: 900 | 3600 | 86400) => void; totalMinor: bigint; saving: boolean; onCreate: () => void; onCancel: () => void }) {
  const update = (id: string, patch: Partial<DraftLine>) => props.setLines((lines) => lines.map((line) => line.id === id ? { ...line, ...patch } as DraftLine : line));
  return <div className="grid gap-4"><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" onClick={props.addProduct}><Plus size={16} /> Product</Button><Button type="button" size="sm" variant="secondary" onClick={props.addCustom}><Plus size={16} /> Custom line</Button></div>{props.lines.map((line) => <div key={line.id} className="grid gap-2 rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between"><Badge tone={line.type === "product" ? "info" : "neutral"}>{line.type === "product" ? "Product" : "Custom"}</Badge><Button size="sm" variant="ghost" aria-label="Remove invoice line" onClick={() => props.setLines((lines) => lines.filter((item) => item.id !== line.id))}><XCircle size={17} /></Button></div>{line.type === "product" ? <select aria-label="Product" value={line.productId} onChange={(event) => update(line.id, { productId: event.target.value })} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100">{props.products.map((product) => <option key={product.id} value={product.id} disabled={product.availableQuantity === 0}>{product.name} · €{(Number(product.unitPrice.minor) / 100).toFixed(2)} · {product.availableQuantity} available</option>)}</select> : <><Input aria-label="Custom line name" value={line.name} onChange={(event) => update(line.id, { name: event.target.value })} placeholder="Line item name" /><Input aria-label="Custom line price" inputMode="decimal" value={line.price} onChange={(event) => update(line.id, { price: event.target.value })} placeholder="Unit price in EUR" /></>}<div className="flex items-center gap-2"><Button type="button" variant="secondary" size="icon" aria-label="Decrease quantity" disabled={line.quantity <= 1} onClick={() => update(line.id, { quantity: line.quantity - 1 })}><Minus size={16} /></Button><span className="min-w-8 text-center font-mono text-sm">{line.quantity}</span><Button type="button" variant="secondary" size="icon" aria-label="Increase quantity" onClick={() => update(line.id, { quantity: line.quantity + 1 })}><Plus size={16} /></Button></div></div>)}<Field><FieldLabel htmlFor="invoice-note">Note <span className="font-normal text-slate-400">optional</span></FieldLabel><Input id="invoice-note" value={props.description} onChange={(event) => props.setDescription(event.target.value)} maxLength={140} placeholder="Counter sale" /></Field><Field><FieldLabel htmlFor="invoice-expiry">QR expires</FieldLabel><select id="invoice-expiry" value={props.expiresInSeconds} onChange={(event) => props.setExpiresInSeconds(Number(event.target.value) as 900 | 3600 | 86400)} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"><option value={900}>15 minutes</option><option value={3600}>1 hour</option><option value={86400}>24 hours</option></select><FieldMessage>Stock is reserved until payment, cancellation, or expiry.</FieldMessage></Field><div className="flex items-baseline justify-between border-t border-slate-200 pt-4"><span className="text-sm text-slate-500">Invoice total</span><span className="font-mono text-xl font-semibold text-slate-950">€{(Number(props.totalMinor) / 100).toFixed(2)}</span></div><Button disabled={props.saving || !props.lines.length} aria-busy={props.saving} onClick={props.onCreate}>{props.saving ? "Creating…" : "Create invoice"}</Button><Button type="button" variant="ghost" onClick={props.onCancel}>Cancel</Button></div>;
}

function InvoiceDetail({ invoice, saving, onCancel }: { invoice: MerchantInvoice; saving: boolean; onCancel: () => void }) {
  const terminal = ["completed", "expired", "cancelled", "failed"].includes(invoice.status);
  return <div className="grid gap-4"><div className="flex items-center justify-between"><Badge tone={statusTone(invoice.status)}>{statusLabel(invoice.status)}</Badge><Money value={invoice.amount} className="text-xl font-semibold text-slate-950" /></div>{!terminal ? <><div className="mx-auto rounded-xl border border-slate-200 bg-white p-4"><QRCodeSVG value={invoice.qrPayload} size={210} level="M" marginSize={1} aria-label={`QR code for ${invoice.invoiceNumber}`} /></div><p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500"><Clock3 size={14} aria-hidden="true" /> Expires {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(invoice.expiresAt))}</p></> : <Alert className={invoice.status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700"}>{invoice.status === "completed" ? <span className="flex items-center gap-2"><CheckCircle2 size={18} /> Payment received</span> : `This invoice is ${invoice.status}.`}</Alert>}<div className="divide-y divide-slate-100 rounded-lg border border-slate-200">{invoice.lines.map((line) => <div key={line.id} className="flex items-center justify-between gap-3 p-3"><div><p className="text-sm font-medium text-slate-950">{line.quantity} × {line.name}</p>{line.sku ? <p className="mt-1 text-xs text-slate-500">SKU {line.sku}</p> : null}</div><Money value={line.lineTotal} className="text-sm text-slate-950" /></div>)}</div>{invoice.status === "pending" ? <Button variant="danger" disabled={saving} aria-busy={saving} onClick={onCancel}>{saving ? "Cancelling…" : "Cancel invoice"}</Button> : null}</div>;
}
