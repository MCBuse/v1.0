"use client";

import type { MerchantTransactionPage } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
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
import { ChevronDown, ChevronRight, RefreshCw, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePortalResource } from "@/lib/client/use-portal-resource";

const RECONCILIATION_TONE = {
  matched: "success",
  unmatched: "warning",
  no_source_records: "neutral",
} as const;

const RECONCILIATION_LABEL = {
  matched: "Matched",
  unmatched: "Not matched",
  no_source_records: "No source records",
} as const;

function when(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/**
 * Q.13 — the receipt history, with the financial attributes attached.
 *
 * What settled against what was displayed, what it cost, what stock it moved
 * and whether an imported settlement record accounts for it: all on one row
 * rather than spread across screens. Searchable and paged, because a merchant
 * looking for one receipt should not have to scroll a year of them.
 */
export function ReceiptHistory() {
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    // A new search starts at the first page; staying on page 7 of the old
    // result set would look like "no results".
    setPage(1);
  }, [applied]);

  const params = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  if (applied) params.set("query", applied);
  const resource = usePortalResource<MerchantTransactionPage>(
    `me/transactions?${params.toString()}`,
    60_000,
  );

  return (
    <section id="receipts" className="grid scroll-mt-28 gap-3" aria-label="Receipt history">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold">Receipts</h2>
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setApplied(query.trim());
            }}
          >
            <Input
              aria-label="Search receipts"
              placeholder="Receipt number or description"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 w-56"
            />
            <Button type="submit" size="sm" variant="secondary">
              <Search className="size-4" aria-hidden /> Search
            </Button>
            {applied ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setQuery("");
                  setApplied("");
                }}
              >
                Clear
              </Button>
            ) : null}
          </form>
        </CardHeader>
        <CardContent className="grid gap-3">
          {resource.loading && !resource.data ? <Skeleton className="h-40" /> : null}

          {!resource.data && resource.error ? (
            <Alert className="border-amber-200 bg-amber-50 text-amber-900">
              <p className="font-semibold">Receipts could not be loaded.</p>
              <p className="mt-1">
                {resource.offline
                  ? "You appear to be offline."
                  : resource.error.message}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => void resource.refresh()}
              >
                <RefreshCw className="size-4" aria-hidden /> Try again
              </Button>
            </Alert>
          ) : null}

          {resource.data && !resource.data.items.length ? (
            <p className="py-6 text-sm text-slate-500">
              {applied
                ? `No receipt matches “${applied}”.`
                : "No receipts yet."}
            </p>
          ) : null}

          {resource.data?.items.length ? (
            <>
              <Table aria-label="Receipt history">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Receipt</TableHead>
                    <TableHead scope="col">Received</TableHead>
                    <TableHead scope="col" className="text-right">
                      Amount
                    </TableHead>
                    <TableHead scope="col">Reconciliation</TableHead>
                    <TableHead scope="col">
                      <span className="sr-table">Detail</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resource.data.items.map((item) => {
                    const open = expanded === item.id;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <span className="font-mono text-xs">
                            {item.receiptNumber}
                          </span>
                          {item.description ? (
                            <span className="block text-xs text-slate-500">
                              {item.description}
                            </span>
                          ) : null}
                          {open ? (
                            <dl className="mt-3 grid gap-1 text-xs text-slate-600">
                              <Detail label="Settled">
                                {item.settlement.amount}{" "}
                                {item.settlement.currency}
                              </Detail>
                              <Detail label="Fees">
                                <Money
                                  value={{
                                    minor: item.fees.merchantFeeMinor,
                                    currency: "EUR",
                                    estimated: false,
                                    rateTimestamp: null,
                                  }}
                                />{" "}
                                — {item.fees.note}
                              </Detail>
                              <Detail label="Net">
                                <Money value={item.netAmount} />
                              </Detail>
                              <Detail label="Stock">
                                {item.stockImpact.unitsSold === null
                                  ? item.stockImpact.note
                                  : `${item.stockImpact.unitsSold} unit${
                                      item.stockImpact.unitsSold === 1 ? "" : "s"
                                    } across ${item.stockImpact.lines} line${
                                      item.stockImpact.lines === 1 ? "" : "s"
                                    }`}
                              </Detail>
                              <Detail label="Records">
                                {item.reconciliation.note}
                                {item.reconciliation.reference
                                  ? ` (${item.reconciliation.reference})`
                                  : ""}
                              </Detail>
                              <Detail label="Environment">
                                {item.environment}
                              </Detail>
                            </dl>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">
                          {when(item.receivedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Money value={item.amount} />
                        </TableCell>
                        <TableCell>
                          <Badge
                            tone={
                              RECONCILIATION_TONE[item.reconciliation.state]
                            }
                          >
                            {RECONCILIATION_LABEL[item.reconciliation.state]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-expanded={open}
                            aria-label={`${
                              open ? "Hide" : "Show"
                            } financial detail for ${item.receiptNumber}`}
                            onClick={() =>
                              setExpanded(open ? null : item.id)
                            }
                          >
                            {open ? (
                              <ChevronDown className="size-4" aria-hidden />
                            ) : (
                              <ChevronRight className="size-4" aria-hidden />
                            )}
                            Detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
                <span>
                  {resource.data.totalItems} receipt
                  {resource.data.totalItems === 1 ? "" : "s"}
                  {applied ? ` matching “${applied}”` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <span aria-live="polite">
                    Page {resource.data.page} of {resource.data.totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= resource.data.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </span>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <dt className="font-medium text-slate-700">{label}:</dt>
      <dd>{children}</dd>
    </div>
  );
}
