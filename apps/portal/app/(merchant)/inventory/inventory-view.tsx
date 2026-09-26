"use client";

/* eslint-disable @next/next/no-img-element */
import type { MerchantProduct, MerchantProductPage } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { EmptyState, ErrorState } from "@repo/ui/empty-state";
import { Field, FieldLabel, FieldMessage, Input } from "@repo/ui/field";
import { Money } from "@repo/ui/money";
import { Skeleton } from "@repo/ui/skeleton";
import {
  Archive,
  ImagePlus,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { ReceivePaymentDrawer } from "@/components/receive-payment";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { PaginationFooter } from "@/components/pagination-footer";

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

const PAGE_SIZE = 25;

export function InventoryView() {
  const router = useRouter();
  const search = useSearchParams();
  const sourceTab: "manual" | "imported" =
    search.get("tab") === "imported" ? "imported" : "manual";
  const showArchived = search.get("archived") === "1";
  const query = search.get("q") ?? "";
  const page = Math.max(1, Number(search.get("page") ?? 1) || 1);

  const params = new URLSearchParams({
    source: sourceTab,
    status: showArchived ? "all" : "active",
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  if (query) params.set("query", query);
  const path = `me/products?${params.toString()}`;
  const resource = usePortalResource<MerchantProductPage>(path);
  const refreshing = Boolean(resource.data) && resource.dataPath !== path;

  /** Any filter change returns to page 1; only page moves add history entries. */
  function navigate(next: Record<string, string | null>, mode: "push" | "replace" = "replace") {
    const updated = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) updated.set(key, value);
      else updated.delete(key);
    }
    if (!("page" in next)) updated.delete("page");
    const url = `/inventory${updated.size ? `?${updated.toString()}` : ""}`;
    if (mode === "push") router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  }

  const [searchInput, setSearchInput] = useState(query);
  useEffect(() => {
    if (searchInput.trim() === query) return;
    const timer = window.setTimeout(() => navigate({ q: searchInput.trim() || null }), 300);
    return () => window.clearTimeout(timer);
    // navigate is recreated each render; the debounce only tracks the typed value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Back/forward can change the query underneath the box; don't fight active typing.
  useEffect(() => {
    if (document.activeElement?.id !== "inventory-search") setSearchInput(query);
  }, [query]);

  // Archiving the last row on a page would otherwise leave an empty page.
  useEffect(() => {
    const data = resource.data;
    if (data && resource.dataPath === path && page > 1 && data.items.length === 0 && data.totalItems > 0)
      navigate({ page: String(Math.max(1, data.totalPages)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.data]);

  const formTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [image, setImage] = useState<File | null>(null);
  const [editing, setEditing] = useState<MerchantProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [pageError, setPageError] = useState("");
  // Q.1 — one drawer for the whole table; the chosen product seeds its lines.
  const [invoiceProductId, setInvoiceProductId] = useState<string | null>(null);

  const products = resource.data?.items ?? [];

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

  const tabs = [
    { id: "manual", label: "Manual inventory" },
    { id: "imported", label: "Imported inventory" },
  ] as const;

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Inventory</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Products and stock
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Stock is reserved while an invoice is waiting for payment.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Inventory sources"
        className="flex gap-6 border-b border-slate-200"
      >
        {tabs.map((tab) => {
          const selected = sourceTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`inventory-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls="inventory-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => navigate({ tab: tab.id === "manual" ? null : tab.id })}
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                event.preventDefault();
                const next = tab.id === "manual" ? "imported" : "manual";
                navigate({ tab: next === "manual" ? null : next });
                document.getElementById(`inventory-tab-${next}`)?.focus();
              }}
              className={`-mb-px min-h-11 border-b-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                selected
                  ? "border-blue-600 text-slate-950"
                  : "border-transparent text-slate-500 hover:text-slate-950"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id="inventory-panel"
        role="tabpanel"
        aria-labelledby={`inventory-tab-${sourceTab}`}
        className="grid gap-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={17}
              aria-hidden="true"
            />
            <Input
              type="search"
              id="inventory-search"
              aria-label="Search products"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search product or SKU"
              className="pl-9"
            />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => navigate({ archived: event.target.checked ? "1" : null })}
            />
            Show archived
          </label>
          {sourceTab === "imported" ? (
            <MerchantImportDrawer kind="inventory" label="Import inventory" onCommitted={() => { window.dispatchEvent(new Event("merchant:refresh")); void resource.refresh(); }} />
          ) : (
            <Button onClick={(event) => beginCreate(event.currentTarget)}><PackagePlus data-icon="inline-start" aria-hidden="true" />Add product</Button>
          )}
        </div>

        {pageError ? (
          <Alert className="border-red-200 bg-red-50 text-red-800">
            {pageError}
          </Alert>
        ) : null}

        <Card
          className={`overflow-hidden transition-opacity ${refreshing ? "opacity-60" : ""}`}
          aria-busy={refreshing}
        >
          {products.length ? (
            <>
              <div
                aria-hidden="true"
                className="hidden grid-cols-[minmax(0,1fr)_7rem_9rem_16rem] gap-4 border-b border-slate-200 px-5 py-3 text-xs font-medium text-slate-500 md:grid"
              >
                <span>Product</span>
                <span className="text-right">Price</span>
                <span className="text-right">Available</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-slate-100">
                {products.map((product) => (
                  <article
                    key={product.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_7rem_9rem_16rem]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-100 text-slate-400">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt=""
                            width={40}
                            height={40}
                            className="size-full object-cover"
                          />
                        ) : (
                          <ImagePlus size={16} aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate font-medium text-slate-950">
                            {product.name}
                          </h2>
                          {product.status === "archived" ? (
                            <Badge tone="neutral">Archived</Badge>
                          ) : null}
                          {product.lowStock ? (
                            <Badge tone="warning">Low stock</Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {[product.sku ? `SKU ${product.sku}` : null, product.category]
                            .filter(Boolean)
                            .join(" · ") || "No SKU"}
                        </p>
                        {product.sourceNames?.length ? <p className="mt-0.5 text-xs text-slate-600">Imported from {product.sourceNames.join(", ")}</p> : null}
                      </div>
                    </div>
                    <div className="text-right text-sm text-slate-950">
                      <Money value={product.unitPrice} />
                    </div>
                    <div className="col-span-2 flex items-baseline gap-2 md:col-span-1 md:block md:text-right">
                      <p className="font-mono text-base font-semibold tabular-nums text-slate-950">
                        {product.availableQuantity}
                        <span className="sr-only"> available</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {product.onHandQuantity} on hand ·{" "}
                        {product.reservedQuantity} reserved
                      </p>
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-1 md:col-span-1">
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
                        Invoice / QR
                      </Button>
                      <div
                        role="group"
                        aria-label={`${product.name} stock`}
                        className="ml-1 flex overflow-hidden rounded-lg border border-slate-300"
                      >
                        <button
                          type="button"
                          aria-label={`Decrease ${product.name} stock`}
                          disabled={product.status === "archived"}
                          onClick={() => void adjust(product, -1)}
                          className="grid size-9 place-items-center text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-50"
                        >
                          <Minus size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Increase ${product.name} stock`}
                          onClick={() => void adjust(product, 1)}
                          className="grid size-9 place-items-center border-l border-slate-300 text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-700"
                        >
                          <Plus size={16} aria-hidden="true" />
                        </button>
                      </div>
                      <RowActionsMenu
                        label={`More actions for ${product.name}`}
                        actions={[
                          {
                            label: "Restock +1",
                            icon: <PackagePlus aria-hidden="true" />,
                            onSelect: () => void adjust(product, 1, "restock"),
                          },
                          {
                            label: "Edit",
                            icon: <Pencil aria-hidden="true" />,
                            onSelect: () =>
                              beginEdit(product, document.activeElement as HTMLButtonElement),
                          },
                          product.status === "active"
                            ? {
                                label: "Archive",
                                icon: <Archive aria-hidden="true" />,
                                onSelect: () => void toggleArchive(product),
                              }
                            : {
                                label: "Restore",
                                icon: <RotateCcw aria-hidden="true" />,
                                onSelect: () => void toggleArchive(product),
                              },
                        ]}
                      />
                    </div>
                  </article>
                ))}
              </div>
              {resource.data ? (
                <PaginationFooter
                  label="Product pages"
                  page={resource.data.page}
                  pageSize={resource.data.pageSize}
                  totalItems={resource.data.totalItems}
                  totalPages={resource.data.totalPages}
                  onPageChange={(next) => navigate({ page: String(next) }, "push")}
                />
              ) : null}
            </>
          ) : query ? (
            <EmptyState
              title="No matching products"
              description={`Nothing matches "${query}". Try a different name or SKU.`}
            />
          ) : (
            <EmptyState
              title={sourceTab === "manual" ? "No manual products yet" : "No imported products yet"}
              description={sourceTab === "manual" ? "Use Add product above to create your first item." : "Use Import inventory above to upload a product catalogue."}
            />
          )}
        </Card>
      </div>

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
