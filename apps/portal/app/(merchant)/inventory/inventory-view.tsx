"use client";

/* eslint-disable @next/next/no-img-element */
import type { MerchantProduct, MerchantProductPage } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { EmptyState, ErrorState } from "@repo/ui/empty-state";
import { Field, FieldLabel, FieldMessage, Input } from "@repo/ui/field";
import { Money } from "@repo/ui/money";
import { Skeleton } from "@repo/ui/skeleton";
import { Archive, ImagePlus, Minus, PackagePlus, Plus, RotateCcw, Search } from "lucide-react";
import { useState } from "react";
import { portalApi } from "@/lib/client/api";
import { euroInputToMinor } from "@/lib/client/money-input";
import { usePortalResource } from "@/lib/client/use-portal-resource";

type Draft = {
  name: string;
  sku: string;
  description: string;
  price: string;
  quantity: string;
  lowStockThreshold: string;
};

const emptyDraft: Draft = { name: "", sku: "", description: "", price: "", quantity: "0", lowStockThreshold: "5" };

function productPayload(draft: Draft) {
  const unitPriceMinor = euroInputToMinor(draft.price);
  if (!draft.name.trim()) throw new Error("Enter a product name.");
  if (!unitPriceMinor) throw new Error("Enter a valid EUR price.");
  const quantity = Number(draft.quantity);
  const lowStockThreshold = Number(draft.lowStockThreshold);
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error("Quantity must be a whole number of zero or more.");
  if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) throw new Error("Low-stock level must be zero or more.");
  return {
    name: draft.name.trim(), sku: draft.sku.trim() || undefined, description: draft.description.trim() || undefined,
    unitPriceMinor, quantity, lowStockThreshold,
  };
}

export function InventoryView() {
  const resource = usePortalResource<MerchantProductPage>("me/products?page=1&pageSize=100");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [image, setImage] = useState<File | null>(null);
  const [editing, setEditing] = useState<MerchantProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const products = (resource.data?.items ?? []).filter((product) => {
    const term = query.trim().toLowerCase();
    return (!showArchived ? product.status === "active" : true) && (!term || product.name.toLowerCase().includes(term) || product.sku?.toLowerCase().includes(term));
  });

  function beginEdit(product: MerchantProduct) {
    setEditing(product);
    setDraft({ name: product.name, sku: product.sku ?? "", description: product.description ?? "", price: (Number(product.unitPrice.minor) / 100).toFixed(2), quantity: String(product.onHandQuantity), lowStockThreshold: String(product.lowStockThreshold) });
    setImage(null);
    setError("");
  }

  function resetForm() {
    setEditing(null);
    setDraft(emptyDraft);
    setImage(null);
    setError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = productPayload(draft);
      let product: MerchantProduct;
      if (editing) {
        product = await portalApi<MerchantProduct>(`me/products/${editing.id}`, { method: "PATCH", body: JSON.stringify({ ...payload, status: editing.status }) });
        const change = payload.quantity - editing.onHandQuantity;
        if (change) product = await portalApi<MerchantProduct>(`me/products/${editing.id}/stock-adjustments`, { method: "POST", body: JSON.stringify({ change }) });
      } else {
        product = await portalApi<MerchantProduct>("me/products", { method: "POST", body: JSON.stringify(payload) });
      }
      if (image) {
        const form = new FormData();
        form.set("image", image);
        await portalApi<MerchantProduct>(`me/products/${product.id}/image`, { method: "POST", body: form });
      }
      await resource.refresh();
      resetForm();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Product could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function adjust(product: MerchantProduct, change: number) {
    setError("");
    try {
      await portalApi<MerchantProduct>(`me/products/${product.id}/stock-adjustments`, { method: "POST", body: JSON.stringify({ change }) });
      await resource.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Stock could not be adjusted."); }
  }

  async function toggleArchive(product: MerchantProduct) {
    setError("");
    try {
      await portalApi<MerchantProduct>(`me/products/${product.id}`, { method: "PATCH", body: JSON.stringify({ status: product.status === "active" ? "archived" : "active" }) });
      await resource.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Product status could not be changed."); }
  }

  if (resource.loading && !resource.data) return <Skeleton className="h-[42rem]" />;
  if (resource.error && !resource.data) return <ErrorState retry={<Button onClick={() => void resource.refresh()}>Try again</Button>} />;

  return <div className="grid gap-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-medium text-blue-700">Inventory</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Products and stock</h1><p className="mt-2 text-sm text-slate-500">Stock is reserved while an invoice is waiting for payment.</p></div>
      <Button onClick={resetForm}><PackagePlus size={18} aria-hidden="true" /> Add product</Button>
    </div>
    {error ? <Alert className="border-red-200 bg-red-50 text-red-800">{error}</Alert> : null}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="overflow-hidden"><CardHeader><div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} aria-hidden="true" /><Input type="search" aria-label="Search products" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product or SKU" className="pl-9" /></div><label className="flex min-h-11 items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Show archived</label></div></CardHeader><CardContent className="px-0 pb-0">
        {products.length ? <div className="divide-y divide-slate-100">{products.map((product) => <article key={product.id} className="flex flex-wrap items-center gap-4 p-5"><div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-500">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="size-full object-cover" /> : <ImagePlus size={20} aria-hidden="true" />}</div><div className="min-w-40 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-950">{product.name}</h2>{product.status === "archived" ? <Badge tone="neutral">Archived</Badge> : null}{product.lowStock ? <Badge tone="warning">Low stock</Badge> : null}</div><p className="mt-1 text-xs text-slate-500">{product.sku ? `SKU ${product.sku} · ` : ""}<Money value={product.unitPrice} /></p></div><div className="min-w-32"><p className="text-xs text-slate-500">Available</p><p className="font-mono text-lg font-semibold text-slate-950">{product.availableQuantity}</p><p className="text-xs text-slate-400">{product.onHandQuantity} on hand · {product.reservedQuantity} reserved</p></div><div className="flex gap-2"><Button variant="secondary" size="icon" aria-label={`Decrease ${product.name} stock`} disabled={product.status === "archived"} onClick={() => void adjust(product, -1)}><Minus size={17} /></Button><Button variant="secondary" size="icon" aria-label={`Increase ${product.name} stock`} onClick={() => void adjust(product, 1)}><Plus size={17} /></Button><Button variant="ghost" size="sm" onClick={() => beginEdit(product)}>Edit</Button><Button variant="ghost" size="sm" onClick={() => void toggleArchive(product)}>{product.status === "active" ? <><Archive size={16} /> Archive</> : <><RotateCcw size={16} /> Restore</>}</Button></div></article>)}</div> : <EmptyState title="No products yet" description="Add your first product to create itemised invoices." action={<Button onClick={resetForm}>Add product</Button>} />}
      </CardContent></Card>
      <Card className="h-fit"><CardHeader><div><h2 className="font-semibold text-slate-950">{editing ? "Edit product" : "New product"}</h2><p className="mt-1 text-sm text-slate-500">Prices are in euros. Changes do not alter existing invoices.</p></div></CardHeader><CardContent><form className="grid gap-4" onSubmit={submit}><Field><FieldLabel htmlFor="product-name">Name *</FieldLabel><Input id="product-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={160} autoComplete="off" /></Field><Field><FieldLabel htmlFor="product-sku">SKU <span className="font-normal text-slate-400">optional</span></FieldLabel><Input id="product-sku" value={draft.sku} onChange={(event) => setDraft({ ...draft, sku: event.target.value })} maxLength={64} autoComplete="off" /></Field><Field><FieldLabel htmlFor="product-price">Unit price *</FieldLabel><Input id="product-price" inputMode="decimal" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} placeholder="0.00" /><FieldMessage>EUR, up to two decimal places</FieldMessage></Field><div className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="product-stock">On hand *</FieldLabel><Input id="product-stock" inputMode="numeric" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} /></Field><Field><FieldLabel htmlFor="product-low-stock">Low stock</FieldLabel><Input id="product-low-stock" inputMode="numeric" value={draft.lowStockThreshold} onChange={(event) => setDraft({ ...draft, lowStockThreshold: event.target.value })} /></Field></div><Field><FieldLabel htmlFor="product-description">Description <span className="font-normal text-slate-400">optional</span></FieldLabel><textarea id="product-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={500} className="min-h-24 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-950 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" /></Field><Field><FieldLabel htmlFor="product-image">Image <span className="font-normal text-slate-400">optional</span></FieldLabel><Input id="product-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] ?? null)} /><FieldMessage>JPEG, PNG, or WebP up to 5 MB</FieldMessage></Field><Button type="submit" disabled={saving} aria-busy={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add product"}</Button>{editing ? <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button> : null}</form></CardContent></Card>
    </div>
  </div>;
}
