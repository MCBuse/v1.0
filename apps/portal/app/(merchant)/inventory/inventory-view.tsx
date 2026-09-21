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
import {
  Archive,
  BarChart3,
  ImagePlus,
  Minus,
  PackagePlus,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { portalApi } from "@/lib/client/api";
import { euroInputToMinor } from "@/lib/client/money-input";
import { usePortalResource } from "@/lib/client/use-portal-resource";
import { MerchantImportDrawer } from "@/components/merchant-import-drawer";
import { InventoryAnalytics } from "@/components/inventory-analytics";
import { ProductAnalyticsDrawer } from "@/components/product-analytics-drawer";
import { ReceivePaymentDrawer } from "@/components/receive-payment";

type Draft = {
  name: string;
  category: string;
  sku: string;
  description: string;
  price: string;
  quantity: string;
  lowStockThreshold: string;
};

const emptyDraft: Draft = {
  name: "",
  category: "",
  sku: "",
  description: "",
  price: "",
  quantity: "0",
  lowStockThreshold: "5",
};

class ProductValidationError extends Error {
  constructor(
    message: string,
    readonly fieldId: string,
  ) {
    super(message);
  }
}

function productPayload(draft: Draft) {
  const unitPriceMinor = euroInputToMinor(draft.price);
  if (!draft.name.trim()) {
    throw new ProductValidationError("Enter a product name.", "product-name");
  }
  if (!unitPriceMinor) {
    throw new ProductValidationError(
      "Enter a valid EUR price.",
      "product-price",
    );
  }

  const quantity = Number(draft.quantity);
  const lowStockThreshold = Number(draft.lowStockThreshold);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new ProductValidationError(
      "Quantity must be a whole number of zero or more.",
      "product-stock",
    );
  }
  if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
    throw new ProductValidationError(
      "Low-stock level must be zero or more.",
      "product-low-stock",
    );
  }

  return {
    name: draft.name.trim(),
    category: draft.category.trim() || undefined,
    sku: draft.sku.trim() || undefined,
    description: draft.description.trim() || undefined,
    unitPriceMinor,
    quantity,
    lowStockThreshold,
  };
}

export function InventoryView() {
  const resource = usePortalResource<MerchantProductPage>(
    "me/products?page=1&pageSize=100",
  );
  const formTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [image, setImage] = useState<File | null>(null);
  const [editing, setEditing] = useState<MerchantProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [pageError, setPageError] = useState("");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [analyticsProduct, setAnalyticsProduct] = useState<MerchantProduct | null>(null);
  // Q.1 — one drawer for the whole table; the chosen product seeds its lines.
  const [invoiceProductId, setInvoiceProductId] = useState<string | null>(null);

  const products = (resource.data?.items ?? []).filter((product) => {
    const term = query.trim().toLowerCase();
    return (
      (!showArchived ? product.status === "active" : true) &&
      (!term ||
        product.name.toLowerCase().includes(term) ||
        product.sku?.toLowerCase().includes(term))
    );
  });

  function resetForm() {
    setEditing(null);
    setDraft(emptyDraft);
    setImage(null);
    setFormError("");
  }

  function beginCreate(trigger: HTMLButtonElement) {
    formTriggerRef.current = trigger;
    resetForm();
    setFormOpen(true);
  }

  function beginEdit(product: MerchantProduct, trigger: HTMLButtonElement) {
    formTriggerRef.current = trigger;
    setEditing(product);
    setDraft({
      name: product.name,
      category: product.category ?? "",
      sku: product.sku ?? "",
      description: product.description ?? "",
      price: (Number(product.unitPrice.minor) / 100).toFixed(2),
      quantity: String(product.onHandQuantity),
      lowStockThreshold: String(product.lowStockThreshold),
    });
    setImage(null);
    setFormError("");
    setFormOpen(true);
  }

  function handleFormOpenChange(nextOpen: boolean) {
    if (!nextOpen && saving) return;
    setFormOpen(nextOpen);
    if (!nextOpen) resetForm();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      const payload = productPayload(draft);
      let product: MerchantProduct;

      if (editing) {
        const { quantity, ...productUpdate } = payload;
        product = await portalApi<MerchantProduct>(
          `me/products/${editing.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ ...productUpdate, status: editing.status }),
          },
        );
        const change = quantity - editing.onHandQuantity;
        if (change) {
          product = await portalApi<MerchantProduct>(
            `me/products/${editing.id}/stock-adjustments`,
            {
              method: "POST",
              body: JSON.stringify({ change }),
            },
          );
        }
      } else {
        product = await portalApi<MerchantProduct>("me/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      if (image) {
        const form = new FormData();
        form.set("image", image);
        await portalApi<MerchantProduct>(`me/products/${product.id}/image`, {
          method: "POST",
          body: form,
        });
      }

      window.dispatchEvent(new Event("merchant:refresh"));
      await resource.refresh();
      setFormOpen(false);
      resetForm();
    } catch (reason) {
      setFormError(
        reason instanceof Error
          ? reason.message
          : "Product could not be saved.",
      );
      if (reason instanceof ProductValidationError) {
        window.requestAnimationFrame(() => {
          document.getElementById(reason.fieldId)?.focus();
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function adjust(product: MerchantProduct, change: number, reason: 'adjustment' | 'restock' = 'adjustment') {
    setPageError("");
    try {
      await portalApi<MerchantProduct>(
        `me/products/${product.id}/stock-adjustments`,
        { method: "POST", body: JSON.stringify({ change, reason }) },
      );
      window.dispatchEvent(new Event("merchant:refresh"));
      await resource.refresh();
    } catch (reason) {
      setPageError(
        reason instanceof Error
          ? reason.message
          : "Stock could not be adjusted.",
      );
    }
  }

  async function toggleArchive(product: MerchantProduct) {
    setPageError("");
    try {
      await portalApi<MerchantProduct>(`me/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: product.status === "active" ? "archived" : "active",
        }),
      });
      window.dispatchEvent(new Event("merchant:refresh"));
      await resource.refresh();
    } catch (reason) {
      setPageError(
        reason instanceof Error
          ? reason.message
          : "Product status could not be changed.",
      );
    }
  }

  if (resource.loading && !resource.data) {
    return <Skeleton className="h-[42rem]" />;
  }

  if (resource.error && !resource.data) {
    return (
      <ErrorState
        retry={
          <Button onClick={() => void resource.refresh()}>Try again</Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-700">Inventory</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Products and stock
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Stock is reserved while an invoice is waiting for payment.
          </p>
        </div>
        <div className="flex gap-3"><MerchantImportDrawer kind="inventory" label="Import inventory" onCommitted={() => window.dispatchEvent(new Event("merchant:refresh"))} /><Button onClick={(event) => beginCreate(event.currentTarget)}><PackagePlus data-icon="inline-start" aria-hidden="true" />Add product</Button></div>
      </div>

      {pageError ? (
        <Alert className="border-red-200 bg-red-50 text-red-800">
          {pageError}
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={17}
                aria-hidden="true"
              />
              <Input
                type="search"
                aria-label="Search products"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search product or SKU"
                className="pl-9"
              />
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              Show archived
            </label>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {products.length ? (
            <div className="divide-y divide-slate-100">
              {products.map((product) => (
                <article
                  key={product.id}
                  className="flex flex-wrap items-center gap-4 p-5"
                >
                  <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-500">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        width={56}
                        height={56}
                        className="size-full object-cover"
                      />
                    ) : (
                      <ImagePlus size={20} aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-40 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-950">
                        {product.name}
                      </h2>
                      {product.status === "archived" ? (
                        <Badge tone="neutral">Archived</Badge>
                      ) : null}
                      {product.lowStock ? (
                        <Badge tone="warning">Low stock</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {product.sku ? `SKU ${product.sku} · ` : ""}
                      {product.category ? `${product.category} · ` : ""}
                      <Money value={product.unitPrice} />
                    </p>
                  </div>
                  <div className="min-w-32">
                    <p className="text-xs text-slate-500">Available</p>
                    <p className="font-mono text-lg font-semibold text-slate-950">
                      {product.availableQuantity}
                    </p>
                    <p className="text-xs text-slate-500">
                      {product.onHandQuantity} on hand ·{" "}
                      {product.reservedQuantity} reserved
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Create invoice or QR for ${product.name}`}
                      disabled={
                        product.status === "archived" ||
                        product.availableQuantity === 0
                      }
                      onClick={() => setInvoiceProductId(product.id)}
                    >
                      <QrCode data-icon="inline-start" aria-hidden="true" />
                      Create invoice / QR
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAnalyticsProduct(product)}
                    >
                      <BarChart3 data-icon="inline-start" aria-hidden="true" />
                      Analytics
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label={`Decrease ${product.name} stock`}
                      disabled={product.status === "archived"}
                      onClick={() => void adjust(product, -1)}
                    >
                      <Minus aria-hidden="true" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label={`Increase ${product.name} stock`}
                      onClick={() => void adjust(product, 1)}
                    >
                      <Plus aria-hidden="true" />
                    </Button>
                    <Button variant="secondary" onClick={() => void adjust(product, 1, 'restock')}>Restock +1</Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(event) =>
                        beginEdit(product, event.currentTarget)
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void toggleArchive(product)}
                    >
                      {product.status === "active" ? (
                        <>
                          <Archive
                            data-icon="inline-start"
                            aria-hidden="true"
                          />
                          Archive
                        </>
                      ) : (
                        <>
                          <RotateCcw
                            data-icon="inline-start"
                            aria-hidden="true"
                          />
                          Restore
                        </>
                      )}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No products yet"
              description="Use Add product at the top of this page to create your first item."
            />
          )}
        </CardContent>
      </Card>

      <InventoryAnalytics />

      <ProductAnalyticsDrawer product={analyticsProduct} open={Boolean(analyticsProduct)} onOpenChange={(open) => { if (!open) setAnalyticsProduct(null); }} />

      <ReceivePaymentDrawer
        open={Boolean(invoiceProductId)}
        onOpenChange={(open) => { if (!open) setInvoiceProductId(null); }}
        preloadProductIds={invoiceProductId ? [invoiceProductId] : undefined}
      />

      <Drawer
        direction="right"
        open={formOpen}
        onOpenChange={handleFormOpenChange}
      >
        <DrawerContent
          className="h-dvh w-full overflow-hidden rounded-none sm:max-w-md"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            formTriggerRef.current?.focus();
          }}
        >
          <DrawerHeader className="relative border-b border-slate-200 pr-16">
            <DrawerTitle className="text-xl font-semibold text-slate-950">
              {editing ? "Edit product" : "Add product"}
            </DrawerTitle>
            <DrawerDescription className="leading-6 text-slate-500">
              Prices are in euros. Changes do not alter existing invoices.
            </DrawerDescription>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close product drawer"
                className="absolute right-3 top-3"
                disabled={saving}
              >
                <X aria-hidden="true" />
              </Button>
            </DrawerClose>
          </DrawerHeader>

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
              {formError ? (
                <Alert
                  id="product-form-error"
                  className="border-red-200 bg-red-50 text-red-800"
                >
                  {formError}
                </Alert>
              ) : null}
              <Field>
                <FieldLabel htmlFor="product-name">Name *</FieldLabel>
                <Input
                  id="product-name"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                  maxLength={160}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="product-sku">
                  SKU{" "}
                  <span className="font-normal text-slate-500">optional</span>
                </FieldLabel>
                <Input
                  id="product-sku"
                  value={draft.sku}
                  onChange={(event) =>
                    setDraft({ ...draft, sku: event.target.value })
                  }
                  maxLength={64}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="product-category">
                  Category{" "}
                  <span className="font-normal text-slate-500">optional</span>
                </FieldLabel>
                <Input
                  id="product-category"
                  value={draft.category}
                  onChange={(event) =>
                    setDraft({ ...draft, category: event.target.value })
                  }
                  maxLength={100}
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="product-price">Unit price *</FieldLabel>
                <Input
                  id="product-price"
                  inputMode="decimal"
                  autoComplete="off"
                  value={draft.price}
                  onChange={(event) =>
                    setDraft({ ...draft, price: event.target.value })
                  }
                  placeholder="0.00"
                />
                <FieldMessage>EUR, up to two decimal places</FieldMessage>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="product-stock">On hand *</FieldLabel>
                  <Input
                    id="product-stock"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    value={draft.quantity}
                    onChange={(event) =>
                      setDraft({ ...draft, quantity: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="product-low-stock">Low stock</FieldLabel>
                  <Input
                    id="product-low-stock"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    value={draft.lowStockThreshold}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        lowStockThreshold: event.target.value,
                      })
                    }
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="product-description">
                  Description{" "}
                  <span className="font-normal text-slate-500">optional</span>
                </FieldLabel>
                <textarea
                  id="product-description"
                  value={draft.description}
                  onChange={(event) =>
                    setDraft({ ...draft, description: event.target.value })
                  }
                  maxLength={500}
                  className="min-h-24 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-950 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="product-image">
                  Image{" "}
                  <span className="font-normal text-slate-500">optional</span>
                </FieldLabel>
                <Input
                  id="product-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    setImage(event.target.files?.[0] ?? null)
                  }
                />
                <FieldMessage>JPEG, PNG, or WebP up to 5 MB</FieldMessage>
              </Field>
            </div>

            <DrawerFooter className="border-t border-slate-200">
              <Button type="submit" disabled={saving} aria-busy={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Save product"}
              </Button>
              <DrawerClose asChild>
                <Button type="button" variant="ghost" disabled={saving}>
                  Cancel
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
