"use client";

import type { MerchantActivityPage } from "@repo/shared";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { EmptyState, ErrorState } from "@repo/ui/empty-state";
import { Money } from "@repo/ui/money";
import { Skeleton } from "@repo/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { usePortalResource } from "@/lib/client/use-portal-resource";
import { portalApi } from "@/lib/client/api";
import { ReceiptHistory } from "@/components/receipt-history";

function evidenceLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function TransactionsView() {
  const router = useRouter();
  const search = useSearchParams();
  const page = Math.max(1, Number(search.get("page") ?? 1) || 1);
  const source = search.get("source") ?? "all";
  const [voiding, setVoiding] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState("");
  const params = new URLSearchParams({ page: String(page), pageSize: "20" }); if (source !== "all") params.set("source", source);
  const resource = usePortalResource<MerchantActivityPage>(
    `me/activity?${params.toString()}`,
  );
  function navigate(next: Record<string, string | null>) {
    const updated = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) updated.set(key, value);
      else updated.delete(key);
    }
    router.push(`/payment/transactions?${updated.toString()}`);
  }
  async function voidCashSale(id: string) {
    const reason = window.prompt("Why is this cash sale being voided? This is retained in the audit history.")?.trim();
    if (!reason) return;
    setVoiding(id); setMutationError("");
    try { await portalApi(`me/cash-sales/${id}/void`, { method: "POST", body: JSON.stringify({ reason }) }); await resource.refresh(); window.dispatchEvent(new Event("merchant:refresh")); }
    catch (reason) { setMutationError(reason instanceof Error ? reason.message : "Could not void the cash sale."); }
    finally { setVoiding(null); }
  }
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
          Recorded sales and receipts
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Verified MCBuse payments and merchant-recorded cash sales retain their evidence sources.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2"><label htmlFor="activity-source" className="text-sm text-slate-600">Source</label><select id="activity-source" value={source} onChange={(event) => navigate({ source: event.target.value === "all" ? null : event.target.value, page: null })} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"><option value="all">All recorded activity</option><option value="mcbuse_payment">Verified MCBuse payments</option><option value="merchant_cash">Merchant-recorded cash</option></select></div>
      {mutationError ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{mutationError}</div> : null}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {resource.loading && !resource.data ? (
            <div className="p-6">
              <Skeleton className="h-80" />
            </div>
          ) : resource.error && !resource.data ? (
            <ErrorState
              retry={
                <Button onClick={() => void resource.refresh()}>
                  Try again
                </Button>
              }
            />
          ) : resource.data?.items.length ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Evidence</TableHead>
                      <TableHead>Recorded</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resource.data.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">
                          {item.receiptNumber}
                        </TableCell>
                        <TableCell>{item.description ?? "Sale"}</TableCell>
                        <TableCell><div className="grid gap-1"><Badge tone={item.source === "mcbuse_payment" ? "success" : "neutral"}>{item.source === "mcbuse_payment" ? "Verified payment" : "Merchant-recorded cash"}</Badge><span className="text-xs text-slate-500">{evidenceLabel(item.verification)} · {evidenceLabel(item.environment)}</span></div></TableCell>
                        <TableCell className="whitespace-nowrap">
                          {new Intl.DateTimeFormat("en-GB", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(item.occurredAt))}
                        </TableCell>
                        <TableCell>
                          <Badge tone={item.status === "recorded" ? "success" : "neutral"}>{item.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-slate-950">
                          <Money value={item.amount} />
                        </TableCell>
                        <TableCell className="text-right">{item.source === "merchant_cash" && item.status === "recorded" ? <Button size="sm" variant="secondary" disabled={voiding === item.id} onClick={() => void voidCashSale(item.id)}>{voiding === item.id ? "Voiding…" : "Void"}</Button> : <span className="text-xs text-slate-400">—</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-500">
                  Page {resource.data.page} of {resource.data.totalPages} ·{" "}
                  {resource.data.totalItems} records
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page <= 1}
                    onClick={() => navigate({ page: String(page - 1) })}
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page >= resource.data.totalPages}
                    onClick={() => navigate({ page: String(page + 1) })}
                  >
                    Next
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              title="No recorded sales yet"
              description="Verified payments and merchant-recorded cash sales will appear here."
            />
          )}
        </CardContent>
      </Card>
      <ReceiptHistory />
    </div>
  );
}
