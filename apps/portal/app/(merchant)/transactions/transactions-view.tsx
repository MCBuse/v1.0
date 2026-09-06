"use client";

import type { MerchantTransactionPage } from "@repo/shared";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { EmptyState, ErrorState } from "@repo/ui/empty-state";
import { Input } from "@repo/ui/field";
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
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePortalResource } from "@/lib/client/use-portal-resource";

export function TransactionsView() {
  const router = useRouter();
  const search = useSearchParams();
  const page = Math.max(1, Number(search.get("page") ?? 1) || 1);
  const query = search.get("query") ?? "";
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (query) params.set("query", query);
  const resource = usePortalResource<MerchantTransactionPage>(
    `me/transactions?${params.toString()}`,
  );
  function navigate(next: Record<string, string | null>) {
    const updated = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) updated.set(key, value);
      else updated.delete(key);
    }
    router.push(`/transactions?${updated.toString()}`);
  }
  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Transactions</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Payment receipts
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Finalized business payments in euros.
        </p>
      </div>
      <Card>
        <CardContent className="pt-5">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              navigate({
                query: String(form.get("query") ?? "").trim() || null,
                page: null,
              });
            }}
          >
            <div className="relative flex-1">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                name="query"
                defaultValue={query}
                placeholder="Search receipt or description"
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="secondary">
              Apply filter
            </Button>
            {query ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate({ query: null, page: null })}
              >
                Clear
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resource.data.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">
                        {item.receiptNumber}
                      </TableCell>
                      <TableCell>{item.description ?? "Payment"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {new Intl.DateTimeFormat("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(item.receivedAt))}
                      </TableCell>
                      <TableCell>
                        <Badge tone="success">Received</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-slate-950">
                        <Money value={item.amount} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-500">
                  Page {resource.data.page} of {resource.data.totalPages} ·{" "}
                  {resource.data.totalItems} receipts
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
              title="No matching receipts"
              description={
                query
                  ? "Try a different receipt number or description."
                  : "Your first finalized payment will appear here."
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
