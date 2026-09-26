"use client";

import type {
  MerchantActivityPage,
  MerchantWorkspaceSummary,
  SavedMerchantAssessment,
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
import { AlertTriangle, Clock3 } from "lucide-react";
import { SalesBars, HourlyRhythm } from "@/components/charts";
import { usePortalResource } from "@/lib/client/use-portal-resource";
import { MerchantInsightsPanel } from "@/components/merchant-insights";
import { PageSection } from "@/components/page-section";

/** The only tile on the Overview: label, one value, an optional detail line. */
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full min-h-32 flex-col pt-5">
        <p className="text-sm text-slate-500">{label}</p>
        <div className="mt-3 text-2xl font-medium tracking-tight text-slate-950">
          {value}
        </div>
        {detail ? (
          <div className="mt-auto pt-2 text-xs text-slate-400">{detail}</div>
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
  const assessments = usePortalResource<{ assessments: SavedMerchantAssessment[] }>("me/assessments");
  const packages = usePortalResource<{ items: Array<{ id: string; createdAt: string }> }>("me/finance-packages");
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
  const latestAssessment = assessments.data?.assessments[0];
  return (
    <div className="grid gap-8">
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
        <p className="text-right text-xs text-slate-400">
          Updated{" "}
          {new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }).format(new Date(data.lastUpdatedAt))}
        </p>
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

      {/* Every section: title + link, one row of tiles, then at most one detail panel. */}

      <PageSection id="overview-payment" title="Payment" href="/payment" framed>
        {data.problemCount > 0 ? (
          <div className="grid gap-3" aria-labelledby="payment-problems">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-red-600" size={18} />
              <h3 id="payment-problems" className="font-semibold text-slate-950">
                Payments needing attention
              </h3>
            </div>
            {data.problems.map((problem) => (
              <Alert key={problem.id} className="border-red-200 bg-red-50 text-red-900">
                <strong className="block">{problem.title}</strong>
                <span className="mt-1 block text-sm">{problem.action}</span>
                <span className="mt-2 block text-xs text-red-700">
                  Reported {DATE_TIME.format(new Date(problem.occurredAt))}
                </span>
              </Alert>
            ))}
            <p className="text-xs text-slate-500">
              Unresolved payments are never included in received totals.
            </p>
          </div>
        ) : null}
        <TileRow>
          <Metric
            label="Estimated available balance"
            value={<Money value={data.availableValue} />}
            detail={<Badge tone="info">Current estimate</Badge>}
          />
          <Metric
            label="Recorded sales today"
            value={<Money value={data.recordedToday} />}
            detail={`${data.recordedSaleCountToday ?? 0} transactions today`}
          />
          <Metric
            label="Average transaction today"
            value={<Money value={data.recordedAverageSaleToday ?? data.recordedAverageSale} />}
          />
          <Metric
            label="Payment capture quality"
            value={
              <span className="font-mono tabular-nums">
                {data.lastCapturedAt || data.problemCount
                  ? `${data.captureQualityPercent.toFixed(2)}%`
                  : "—"}
              </span>
            }
            detail={
              !data.lastCapturedAt && !data.problemCount ? (
                <Badge tone="neutral">No data</Badge>
              ) : (
                <Badge tone={data.problemCount ? "danger" : "success"}>
                  {data.problemCount ? "Needs attention" : "Healthy"}
                </Badge>
              )
            }
          />
        </TileRow>
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-slate-950">Recent recorded activity</h3>
            {data.pendingRequestCount > 0 ? (
              <p className="text-sm text-slate-500">
                {data.pendingRequestCount} open payment{" "}
                {data.pendingRequestCount === 1 ? "request is" : "requests are"}{" "}
                waiting or finalizing.
              </p>
            ) : null}
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
                          {DATE_TIME.format(new Date(item.occurredAt))}
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
      </PageSection>

      <PageSection id="overview-analytics" title="Analytics" href="/analytics" framed>
        <TileRow>
          <Metric
            label="Recorded sales · 30 days"
            value={<Money value={data.recorded30Days} />}
            detail={`${data.recordedSaleCount30Days} recorded sales`}
          />
          <Metric
            label="Top product today"
            value={data.topProductToday?.name ?? "No product-linked sales"}
            detail={data.topProductToday ? `${data.topProductToday.quantitySold} units` : undefined}
          />
          <Metric
            label="Busiest hour today"
            value={data.peakSellingHourToday ?? "No pattern yet"}
          />
          <Metric
            label="Low-stock products"
            value={
              <a className="font-mono tabular-nums text-blue-700" href="/inventory">
                {data.lowStockProductCount}
              </a>
            }
            detail="View Inventory"
          />
        </TileRow>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-slate-950">Daily trend</h3>
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
              <h3 className="font-semibold text-slate-950">Sales rhythm</h3>
            </CardHeader>
            <CardContent>
              <HourlyRhythm buckets={data.recordedHourlyRhythm} />
            </CardContent>
          </Card>
        </div>
        <MerchantInsightsPanel limit={3} />
      </PageSection>

      <PageSection id="overview-credit" title="Credit Assessment" href="/credit-assessment" framed>
        <TileRow>
          <Metric
            label="Saved assessments"
            value={
              <span className="font-mono tabular-nums">
                {assessments.data ? assessments.data.assessments.length : assessments.loading ? "…" : "—"}
              </span>
            }
            detail={latestAssessment ? `Latest ${DATE_TIME.format(new Date(latestAssessment.createdAt))}` : undefined}
          />
          <Metric
            label="Evidence readiness"
            value={<span className="capitalize">{data.readinessStage.replaceAll("_", " ")}</span>}
            detail="Not a credit decision"
          />
        </TileRow>
      </PageSection>

      <PageSection id="overview-finance" title="Finance Match" href="/finance-match" framed>
        <TileRow>
          <Metric
            label="Saved PDFs"
            value={
              <span className="font-mono tabular-nums">
                {packages.data ? packages.data.items.length : packages.loading ? "…" : "—"}
              </span>
            }
            detail={packages.data?.items[0] ? `Latest ${DATE_TIME.format(new Date(packages.data.items[0].createdAt))}` : undefined}
          />
        </TileRow>
      </PageSection>
    </div>
  );
}

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Fixed four-column rhythm so tiles line up across every section. */
function TileRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  );
}

