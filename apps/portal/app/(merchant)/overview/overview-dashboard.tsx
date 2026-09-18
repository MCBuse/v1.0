"use client";

import type {
  MerchantActivityPage,
  MerchantWorkspaceSummary,
} from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
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
import { AlertTriangle, ArrowRight, Clock3 } from "lucide-react";
import { SalesBars, HourlyRhythm } from "@/components/charts";
import { usePortalResource } from "@/lib/client/use-portal-resource";

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-slate-500">{label}</p>
        <div className="mt-3 text-2xl font-medium tracking-tight text-slate-950">
          {value}
        </div>
        {detail ? (
          <p className="mt-2 text-xs text-slate-400">{detail}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function OverviewDashboard() {
  const summary = usePortalResource<MerchantWorkspaceSummary>(
    "me/summary?period=30d",
  );
  const activity = usePortalResource<MerchantActivityPage>(
    "me/activity?page=1&pageSize=5",
  );
  if (summary.loading && !summary.data)
    return (
      <div className="grid gap-6" aria-label="Loading overview">
        <Skeleton className="h-10 w-52" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  if (!summary.data)
    return (
      <ErrorState
        retry={
          <Button onClick={() => void summary.refresh()}>Try again</Button>
        }
      />
    );
  const data = summary.data;
  const delayed = Date.now() - new Date(data.lastUpdatedAt).getTime() > 90_000;
  const hasDailySales = data.recordedDailyTrend.some(
    (bucket) => bucket.paymentCount > 0,
  );
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-700">Overview</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Your business, at a glance
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Recorded sales include finalized MCBuse payments and merchant-recorded cash.
          </p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <p>
            Updated{" "}
            {new Intl.DateTimeFormat("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }).format(new Date(data.lastUpdatedAt))}
          </p>
        </div>
      </div>
      {summary.offline ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          You appear to be offline. Showing the last values loaded on this
          device.
        </Alert>
      ) : delayed || summary.error ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          Live updates are delayed. Existing totals remain visible while we
          reconnect.
        </Alert>
      ) : null}
      {data.problemCount > 0 ? (
        <section className="grid gap-3" aria-labelledby="payment-problems">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-red-600" size={18} />
            <h2 id="payment-problems" className="font-semibold text-slate-950">
              Payments needing attention
            </h2>
          </div>
          {data.problems.map((problem) => (
            <Alert
              key={problem.id}
              className="border-red-200 bg-red-50 text-red-900"
            >
              <strong className="block">{problem.title}</strong>
              <span className="mt-1 block text-sm">{problem.action}</span>
              <span className="mt-2 block text-xs text-red-700">
                Reported{" "}
                {new Intl.DateTimeFormat("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(problem.occurredAt))}
              </span>
            </Alert>
          ))}
          <p className="text-xs text-slate-500">
            Unresolved payments are never included in received totals.
          </p>
        </section>
      ) : null}
      <Card className="overflow-hidden">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Estimated available balance
              </p>
              <Money
                value={data.availableValue}
                className="mt-3 block text-4xl font-medium tracking-tight text-slate-950 sm:text-5xl"
              />
              <p className="mt-3 text-xs text-slate-400">
                Estimated at the rate captured{" "}
                {data.availableValue.rateTimestamp
                  ? new Intl.DateTimeFormat("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(data.availableValue.rateTimestamp))
                  : "recently"}
                .
              </p>
            </div>
            <Badge tone="info">Current estimate</Badge>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Recorded sales today"
          value={<Money value={data.recordedToday} />}
        />
        <Metric
          label="Recorded sale count · 30 days"
          value={<Money value={data.recorded30Days} />}
        />
        <Metric
          label="Recorded sales · 30 days"
          value={
            <span className="font-mono tabular-nums">
              {data.recordedSaleCount30Days}
            </span>
          }
        />
        <Metric
          label="Low-stock products"
          value={
            <a className="font-mono tabular-nums text-blue-700" href="/analytics/inventory">
              {data.lowStockProductCount}
            </a>
          }
          detail="View Inventory"
        />
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div>
            <p className="text-sm font-medium text-slate-950">
              Payment capture quality
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {data.lastCapturedAt
                ? `Last received ${new Intl.DateTimeFormat("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(data.lastCapturedAt))}`
                : "No finalized payment history yet"}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-medium tabular-nums text-slate-950">
              {data.lastCapturedAt || data.problemCount
                ? `${data.captureQualityPercent.toFixed(2)}%`
                : "—"}
            </p>
            {!data.lastCapturedAt && !data.problemCount ? (
              <Badge tone="neutral">No data</Badge>
            ) : (
              <Badge tone={data.problemCount ? "danger" : "success"}>
                {data.problemCount ? "Needs attention" : "Healthy"}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-6 2xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <h2 className="font-semibold text-slate-950">Daily trend</h2>
              <p className="mt-1 text-sm text-slate-500">
                Recorded sales over the last 30 days
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {hasDailySales ? (
              <SalesBars
                buckets={data.recordedDailyTrend}
                label="Daily recorded sales amount for the last 30 days"
              />
            ) : (
              <EmptyState
                title="Your first sale will appear here"
                description="Create a payment request, then ask the customer to scan it in MCBuse."
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <h2 className="font-semibold text-slate-950">Sales rhythm</h2>
              <p className="mt-1 text-sm text-slate-500">
                When recorded sales usually occur
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <HourlyRhythm buckets={data.recordedHourlyRhythm} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <div>
            <h2 className="font-semibold text-slate-950">
              Recent recorded activity
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Finalized MCBuse payments and merchant-recorded cash sales.
            </p>
          </div>
          <a
            href="/analytics/transactions"
            className="flex min-h-11 items-center gap-1 text-sm font-semibold text-blue-700"
          >
            View all <ArrowRight size={16} />
          </a>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {activity.loading && !activity.data ? (
            <div className="p-5">
              <Skeleton className="h-32" />
            </div>
          ) : activity.data?.items.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {item.receiptNumber}
                    </TableCell>
                    <TableCell>{item.description ?? "Sale"}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 size={14} />
                        {new Intl.DateTimeFormat("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(item.occurredAt))}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium text-slate-950">
                      <Money value={item.amount} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No recorded activity yet"
              description="Finalized payments and merchant-recorded cash sales will appear here."
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div>
            <p className="text-sm font-medium text-slate-950">
              Evidence readiness
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Demonstration evidence completeness, not a credit decision.
            </p>
          </div>
          <a
            href="/credit-assessment"
            className="text-sm font-semibold text-blue-700"
          >
            {data.readinessStage.replaceAll("_", " ")}
          </a>
        </CardContent>
      </Card>
      {data.pendingRequestCount > 0 ? (
        <p className="text-sm text-slate-500">
          {data.pendingRequestCount} open payment{" "}
          {data.pendingRequestCount === 1 ? "request is" : "requests are"}{" "}
          waiting or finalizing.
        </p>
      ) : null}
    </div>
  );
}
