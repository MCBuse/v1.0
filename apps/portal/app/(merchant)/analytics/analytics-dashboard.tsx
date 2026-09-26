"use client";

import type { MerchantAnalytics } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
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
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePortalResource } from "@/lib/client/use-portal-resource";
import {
  AnalyticsFilters,
  useAnalyticsFilters,
} from "@/components/analytics-filters";
import { MerchantInsightsPanel } from "@/components/merchant-insights";
import { PageSection } from "@/components/page-section";

/**
 * Deep analytics: only what General analytics does not already show.
 *
 * Business insights (forecasts, stock risk, anomalies) are fetched on their
 * own, so a failed `me/analytics` request can only ever affect the recorded
 * patterns section below them, never the insights.
 */
export function AnalyticsDashboard() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
          Deep analytics
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Signals drawn from your recorded activity: forecasts, stock risks and
          unusual patterns worth reviewing. They are prompts for review, not
          established facts about turnover, profit or cause.
        </p>
      </div>
      <nav aria-label="Analytics views" className="flex flex-wrap gap-2">
        <Button asChild variant="secondary">
          <Link href="/analytics/general">General analytics</Link>
        </Button>
        <Button aria-current="page">Deep analytics</Button>
      </nav>
      <MerchantInsightsPanel />
      <RecordedPatterns />
    </div>
  );
}

const WEEKDAYS = Array.from({ length: 7 }, (_, index) =>
  // 1 January 2024 was a Monday, so index 0 is Monday.
  new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2024, 0, 1 + index)),
  ),
);

function weekdayPattern(data: MerchantAnalytics) {
  const rows = WEEKDAYS.map((label) => ({
    label,
    days: 0,
    sales: 0,
    amountMinor: 0n,
  }));
  for (const item of data.dailyTrend) {
    // `start` is a calendar date in the merchant's timezone; reading it as UTC
    // only recovers its weekday, it does not shift the day.
    const sundayFirst = new Date(`${item.start}T00:00:00.000Z`).getUTCDay();
    const row = rows[(sundayFirst + 6) % 7];
    if (!row) continue;
    row.days += 1;
    row.sales += item.paymentCount;
    row.amountMinor += BigInt(item.amountMinor);
  }
  return rows;
}

function RecordedPatterns() {
  const filters = useAnalyticsFilters();
  const resource = usePortalResource<MerchantAnalytics>(filters.path);
  const data = resource.data;

  return (
    <PageSection id="recorded-patterns" title="Recorded activity patterns" framed>
      <p className="text-sm text-slate-500">
        The filters below apply to this section only. Business insights above
        are calculated from all recorded activity.
      </p>
      <AnalyticsFilters filters={filters} />
      {resource.loading && !data ? (
        <Skeleton className="h-64" />
      ) : !data ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-semibold">
            Recorded activity patterns could not be loaded.
          </p>
          <p className="mt-1">
            {resource.offline
              ? "You appear to be offline. They will return when the connection does."
              : (resource.error?.message ?? "The request failed.")}
          </p>
          <p className="mt-1 text-xs">
            This is a problem reading your records, not a finding that there
            were no sales.
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
      ) : (
        <PatternsContent data={data} refreshFailed={Boolean(resource.error)} />
      )}
    </PageSection>
  );
}

function PatternsContent({
  data,
  refreshFailed,
}: {
  data: MerchantAnalytics;
  refreshFailed: boolean;
}) {
  const weekdays = weekdayPattern(data);
  const hasSales = weekdays.some((row) => row.sales > 0);
  const unassignedItems = data.unassignedItems ?? [];
  const date = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: data.period.timezone,
  });

  return (
    <>
      <p className="font-mono text-xs text-slate-500">
        {date.format(new Date(data.period.from))} –{" "}
        {date.format(new Date(data.period.to))} · {data.period.timezone}
        {data.period.partialCurrentDay ? " · current day is partial" : ""}
      </p>
      {refreshFailed ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          These figures are the last ones that loaded; the most recent refresh
          failed.
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-slate-950">Sales by weekday</h3>
        </CardHeader>
        <CardContent className="grid gap-3">
          {hasSales ? (
            <Table>
              <caption className="sr-only">
                Recorded sales by weekday in the selected period
              </caption>
              <TableHeader>
                <tr>
                  <TableHead scope="col">Weekday</TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right font-semibold">
                    Days in period
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right font-semibold">
                    Sales
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right font-semibold">
                    Amount
                  </TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {weekdays.map((row) => (
                  <TableRow key={row.label}>
                    <th
                      scope="row"
                      className="px-4 py-3 font-medium text-slate-950"
                    >
                      {row.label}
                    </th>
                    <TableCell className="py-3 text-right font-mono tabular-nums">
                      {row.days}
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono tabular-nums">
                      {row.sales}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <Money
                        value={{
                          ...data.totalRecordedSales,
                          minor: row.amountMinor.toString(),
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-slate-500">
              No recorded sales in this period, so there is no weekday pattern
              to show.
            </p>
          )}
          <p className="text-xs text-slate-500">
            Recorded sales on each weekday of the selected period, including
            days with none. A weekday that occurs more often in the period will
            show more sales for that reason alone.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-slate-950">
            Sale lines without a product
          </h3>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {unassignedItems.length ? (
            unassignedItems.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between gap-3"
              >
                <span className="truncate">{item.name}</span>
                <span className="whitespace-nowrap text-slate-600">
                  <span className="font-mono tabular-nums">
                    {item.quantitySold}
                  </span>{" "}
                  units · <Money value={item.totalSales} />
                </span>
              </div>
            ))
          ) : (
            <p className="text-slate-500">
              No custom sale lines in this period.
            </p>
          )}
          <p className="pt-1 text-xs text-slate-500">
            These recorded lines have no product ID, so they are not assigned
            to a catalogue product.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
