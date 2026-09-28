"use client";

import type { AnalyticsGrouping, GeneralAnalyticsResponse } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Skeleton } from "@repo/ui/skeleton";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { usePortalResource } from "@/lib/client/use-portal-resource";
import {
  FacetFilter,
  ResetFilters,
  SOURCE_OPTIONS,
} from "@/components/analytics-toolbar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChartWithTable } from "./chart-with-table";
import { SortableTable } from "./sortable-table";

const PERIODS = ["today", "7d", "30d", "90d", "180d", "365d"] as const;
const GROUPINGS: AnalyticsGrouping[] = ["day", "week", "month"];
const GROUPING_LABELS: Record<AnalyticsGrouping, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
};

const TABS = [
  {
    id: "transactions",
    label: "Transaction analytics",
    legacyHash: "#transaction-analytics",
  },
  {
    id: "inventory",
    label: "Inventory analytics",
    legacyHash: "#inventory-analytics",
  },
  {
    id: "combined",
    label: "Combined analytics",
    legacyHash: "#combined-analytics",
  },
] as const;
type TabId = (typeof TABS)[number]["id"];
const DEFAULT_TAB: TabId = "transactions";

function tabFrom(value: string | null): TabId {
  return TABS.find((tab) => tab.id === value)?.id ?? DEFAULT_TAB;
}

function euros(minor: string) {
  const negative = minor.startsWith("-");
  const digits = (negative ? minor.slice(1) : minor).padStart(3, "0");
  const value = Number(`${digits.slice(0, -2)}.${digits.slice(-2)}`);
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(negative ? -value : value);
}

function percent(value: number | null) {
  if (value === null) return "No baseline";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}

function hour(value: number) {
  return `${String(value).padStart(2, "0")}:00`;
}

/**
 * General Analytics: transactions, inventory and the combined readings, one
 * tab each. The selected tab lives in the URL (`?tab=inventory|combined`,
 * omitted for transactions); the filters and the single data read are shared
 * by all three tabs, so switching tabs neither refetches nor resets them.
 *
 * Every chart carries its numbers, every detail table sorts and pages, and
 * every figure the calculation refused to produce says why rather than showing
 * a zero.
 */
export function GeneralAnalyticsView() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const activeTab = tabFrom(search.get("tab"));

  /** Swaps the tab in place: other query params stay, no scroll, no history entry. */
  function selectTab(next: TabId) {
    const updated = new URLSearchParams(search.toString());
    if (next === DEFAULT_TAB) updated.delete("tab");
    else updated.set("tab", next);
    const query = updated.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }

  // Links written before the tabs existed point at section anchors; honour
  // them once on arrival and rewrite them into the `?tab=` form.
  useEffect(() => {
    const legacy = TABS.find((tab) => tab.legacyHash === window.location.hash);
    if (legacy) selectTab(legacy.id);
    // Only the address the page was opened with matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30d");
  const [grouping, setGrouping] = useState<AnalyticsGrouping>("day");
  const [source, setSource] = useState<string>("all");

  const path = useMemo(() => {
    const params = new URLSearchParams({ period, grouping });
    if (source !== "all") params.set("source", source);
    return `me/analytics/general?${params.toString()}`;
  }, [grouping, period, source]);

  const resource = usePortalResource<GeneralAnalyticsResponse>(path, 60_000);

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
          General analytics
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Transactions, inventory and what the two say together.
        </p>
      </div>

      <nav aria-label="Analytics views" className="flex flex-wrap gap-2">
        <Button aria-current="page">General analytics</Button>
        <Button asChild variant="secondary">
          <Link href="/analytics/deep">Deep analytics</Link>
        </Button>
      </nav>

      <div
        role="group"
        aria-label="Analytics filters"
        className="flex flex-wrap items-center gap-2"
      >
        <ToggleGroup
          type="single"
          aria-label="Period"
          value={period}
          onValueChange={(value) => {
            if (value) setPeriod(value as (typeof PERIODS)[number]);
          }}
        >
          {PERIODS.map((value) => (
            <ToggleGroupItem key={value} value={value}>
              {value === "today" ? "Today" : value}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Select
          value={grouping}
          onValueChange={(value) => setGrouping(value as AnalyticsGrouping)}
        >
          <SelectTrigger>
            <span className="text-slate-500">Group by</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUPINGS.map((value) => (
              <SelectItem key={value} value={value}>
                {GROUPING_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FacetFilter
          title="Source"
          options={SOURCE_OPTIONS}
          value={source === "all" ? null : source}
          onChange={(value) => setSource(value ?? "all")}
        />
        {period !== "30d" || grouping !== "day" || source !== "all" ? (
          <ResetFilters
            onReset={() => {
              setPeriod("30d");
              setGrouping("day");
              setSource("all");
            }}
          />
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="General analytics"
        className="flex gap-4 border-b border-slate-200 sm:gap-6"
      >
        {TABS.map((tab, index) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`general-analytics-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls="general-analytics-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => {
                let target: number;
                if (event.key === "ArrowRight")
                  target = (index + 1) % TABS.length;
                else if (event.key === "ArrowLeft")
                  target = (index - 1 + TABS.length) % TABS.length;
                else if (event.key === "Home") target = 0;
                else if (event.key === "End") target = TABS.length - 1;
                else return;
                event.preventDefault();
                const next = TABS[target]!.id;
                selectTab(next);
                document
                  .getElementById(`general-analytics-tab-${next}`)
                  ?.focus();
              }}
              className={`-mb-px min-h-11 border-b-2 text-left text-sm leading-tight font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
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
        id="general-analytics-panel"
        role="tabpanel"
        aria-labelledby={`general-analytics-tab-${activeTab}`}
        className="grid min-w-0 gap-4 [&>*]:min-w-0"
      >
        {resource.loading && !resource.data ? (
          <Skeleton className="h-96" />
        ) : null}

        {!resource.data && resource.error ? (
          <Alert className="border-amber-200 bg-amber-50 text-amber-900">
            <p className="font-semibold">Analytics could not be loaded.</p>
            <p className="mt-1">
              {resource.offline
                ? "You appear to be offline. The figures will return when the connection does."
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

        {resource.data ? (
          <>
            {resource.error ? (
              <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                These are the last figures that loaded; the most recent refresh
                failed.
              </Alert>
            ) : null}
            {activeTab === "transactions" ? (
              <TransactionsSection data={resource.data} />
            ) : null}
            {activeTab === "inventory" ? (
              <InventorySection data={resource.data} />
            ) : null}
            {activeTab === "combined" ? (
              <CombinedSection data={resource.data} />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-xl tabular-nums text-slate-950">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** One figure per card, so each reading stands on its own. */
function StatCard(props: { label: string; value: string; hint?: string }) {
  return (
    <Card className="h-full">
      <CardContent className="py-5">
        <Stat {...props} />
      </CardContent>
    </Card>
  );
}

function TransactionsSection({ data }: { data: GeneralAnalyticsResponse }) {
  const t = data.transactions;
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      {t.labels.notes.length ? <Alert>{t.labels.notes.join(" ")}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Recorded sales"
          value={euros(t.totals.salesMinor)}
          hint={`${t.totals.transactionCount} transactions`}
        />
        <StatCard
          label="Average transaction"
          value={euros(t.totals.averageTransactionMinor)}
        />
        <StatCard
          label="Sales trend"
          value={percent(t.trends.sales.changePercent)}
          hint={
            t.trends.sales.baselineAvailable
              ? `against ${euros(t.trends.sales.previousMinor)} before`
              : "No comparable preceding period"
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Digital sales"
          value={euros(t.bySource.digital.amountMinor)}
          hint={`${t.bySource.digital.count} sales · ${t.bySource.digital.amountSharePercent}% of value · ${t.bySource.digital.countSharePercent}% of count`}
        />
        <StatCard
          label="Cash sales"
          value={euros(t.bySource.cash.amountMinor)}
          hint={`${t.bySource.cash.count} sales · ${t.bySource.cash.amountSharePercent}% of value · ${t.bySource.cash.countSharePercent}% of count`}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <h2 className="font-semibold">Sales by {t.range.grouping}</h2>
          {t.labels.partialPeriod ? (
            <Badge tone="warning">Partial reporting periods</Badge>
          ) : null}
        </CardHeader>
        <CardContent>
          <ChartWithTable
            label={`Recorded sales by ${t.range.grouping}`}
            columns={["Amount", "Transactions", "Average", "Complete"]}
            bars={t.series.map((point) => ({
              key: point.periodStart,
              label: point.label,
              value: Number(point.amountMinor),
              cells: [
                euros(point.amountMinor),
                String(point.count),
                euros(point.averageMinor),
                point.partial
                  ? point.partialReasons?.includes("range_start") ||
                    point.partialReasons?.includes("range_end")
                    ? "Clipped by selected range"
                    : "Still running"
                  : "Complete",
              ],
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">When the day trades</h2>
        </CardHeader>
        <CardContent className="grid gap-4 [&>*]:min-w-0">
          <ChartWithTable
            label="Sales by hour of day"
            height="h-28"
            columns={["Amount", "Transactions"]}
            bars={t.hourly.map((entry) => ({
              key: String(entry.hour),
              label: hour(entry.hour),
              value: Number(entry.amountMinor),
              cells: [euros(entry.amountMinor), String(entry.count)],
            }))}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Peak hour"
              value={t.peakHour ? hour(t.peakHour.hour) : "No sales"}
              hint={
                t.peakHour
                  ? `${euros(t.peakHour.amountMinor)} · ${t.peakHour.count} sales`
                  : undefined
              }
            />
            <Stat
              label="Busiest three hours"
              value={
                t.busiestWindow
                  ? `${hour(t.busiestWindow.startHour)}–${hour(
                      t.busiestWindow.endHour + 1,
                    )}`
                  : "No sales"
              }
              hint={
                t.busiestWindow
                  ? `${t.busiestWindow.amountSharePercent}% of revenue`
                  : undefined
              }
            />
            <Stat
              label="Trading window"
              value={
                t.tradingWindow
                  ? `${hour(t.tradingWindow.firstHour)}–${hour(
                      t.tradingWindow.lastHour,
                    )}`
                  : "No sales"
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Payment methods</h2>
        </CardHeader>
        <CardContent>
          <SortableTable
            caption="Sales by payment method"
            rows={t.byPaymentMethod}
            rowKey={(row) => row.method}
            initialSort={{ key: "amount", direction: "desc" }}
            columns={[
              {
                key: "method",
                label: "Method",
                sortValue: (row) => row.method,
                render: (row) => row.method.replaceAll("_", " "),
              },
              {
                key: "amount",
                label: "Amount",
                numeric: true,
                sortValue: (row) => Number(row.amountMinor),
                render: (row) => euros(row.amountMinor),
              },
              {
                key: "count",
                label: "Sales",
                numeric: true,
                sortValue: (row) => row.count,
                render: (row) => row.count,
              },
              {
                key: "share",
                label: "Share",
                numeric: true,
                sortValue: (row) => row.amountSharePercent,
                render: (row) => `${row.amountSharePercent}%`,
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function InventorySection({ data }: { data: GeneralAnalyticsResponse }) {
  const v = data.inventory;
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      {v.notes.length ? <Alert>{v.notes.join(" ")}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Current on hand"
          value={String(v.position.onHandQuantity)}
        />
        <StatCard
          label="Reserved"
          value={String(v.position.reservedQuantity)}
        />
        <StatCard
          label="Available"
          value={String(v.position.availableQuantity)}
        />
        <StatCard
          label="Value at selling price"
          value={euros(v.valuation.atSellingPriceMinor)}
          hint={v.valuation.note}
        />
      </div>

      <NeedsAttention inventory={v} />

      <Card>
        <CardHeader>
          <div>
            <h2 className="font-semibold">Current stock by product</h2>
            <p className="mt-1 text-sm text-slate-500">
              Every product with what is on the shelf now and what sold in the
              selected period.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <SortableTable
            caption="Current stock by product"
            rows={v.stock ?? []}
            rowKey={(row) => row.productId}
            initialSort={{ key: "status", direction: "asc" }}
            emptyMessage="No products in the catalogue yet."
            columns={[
              {
                key: "name",
                label: "Product",
                sortValue: (row) => row.name,
                render: (row) => (
                  <span className="font-medium text-slate-950">{row.name}</span>
                ),
              },
              {
                key: "category",
                label: "Category",
                sortValue: (row) => row.category ?? "",
                render: (row) => row.category ?? "Uncategorised",
              },
              {
                key: "onHand",
                label: "In stock",
                numeric: true,
                sortValue: (row) => row.onHandQuantity,
                render: (row) => row.onHandQuantity,
              },
              {
                key: "available",
                label: "Available",
                numeric: true,
                sortValue: (row) => available(row),
                render: (row) => available(row),
              },
              {
                key: "threshold",
                label: "Reorder at",
                numeric: true,
                sortValue: (row) => row.lowStockThreshold,
                render: (row) => row.lowStockThreshold,
              },
              {
                key: "unitsSold",
                label: "Sold",
                numeric: true,
                sortValue: (row) => row.unitsSold,
                render: (row) => row.unitsSold,
              },
              {
                key: "status",
                label: "Status",
                sortValue: (row) => stockStatus(row).rank,
                render: (row) => {
                  const status = stockStatus(row);
                  return <Badge tone={status.tone}>{status.label}</Badge>;
                },
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Units sold by category</h2>
        </CardHeader>
        <CardContent className="grid gap-6">
          <CategoryUnits rows={v.byCategory} />
          <SortableTable
            caption="Sales by category"
            rows={v.byCategory}
            rowKey={(row) => row.category}
            initialSort={{ key: "unitsSold", direction: "desc" }}
            emptyMessage="No category-linked sales in this period."
            columns={[
              {
                key: "category",
                label: "Category",
                sortValue: (row) => row.category,
                render: (row) => (
                  <span className="font-medium text-slate-950">
                    {row.category}
                  </span>
                ),
              },
              {
                key: "unitsSold",
                label: "Units sold",
                numeric: true,
                sortValue: (row) => row.unitsSold,
                render: (row) => row.unitsSold,
              },
              {
                key: "amount",
                label: "Amount",
                numeric: true,
                sortValue: (row) => Number(row.amountMinor),
                render: (row) => euros(row.amountMinor),
              },
              {
                key: "products",
                label: "Products",
                numeric: true,
                sortValue: (row) => row.productCount,
                render: (row) => row.productCount,
              },
              {
                key: "source",
                label: "Category from",
                sortValue: (row) => row.categorySource,
                render: (row) => (
                  <Badge
                    tone={
                      row.categorySource === "recorded" ? "success" : "warning"
                    }
                  >
                    {row.categorySource === "recorded"
                      ? "recorded at sale"
                      : row.categorySource === "mixed"
                        ? "mixed"
                        : "current product"}
                  </Badge>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Best sellers</h2>
        </CardHeader>
        <CardContent>
          <SortableTable
            caption="Product performance"
            rows={v.fastMoving}
            rowKey={(row) => row.productId}
            initialSort={{ key: "unitsPerDay", direction: "desc" }}
            emptyMessage="No product-linked sales in this period."
            columns={[
              {
                key: "name",
                label: "Product",
                sortValue: (row) => row.name,
                render: (row) => row.name,
              },
              {
                key: "unitsSold",
                label: "Units sold",
                numeric: true,
                sortValue: (row) => row.unitsSold,
                render: (row) => row.unitsSold,
              },
              {
                key: "unitsPerDay",
                label: "Per day",
                numeric: true,
                sortValue: (row) => row.unitsPerDay,
                render: (row) => row.unitsPerDay.toFixed(1),
              },
              {
                key: "onHand",
                label: "In stock",
                numeric: true,
                sortValue: (row) => row.onHandQuantity,
                render: (row) => row.onHandQuantity,
              },
              {
                key: "threshold",
                label: "Reorder at",
                numeric: true,
                sortValue: (row) => row.lowStockThreshold,
                render: (row) => row.lowStockThreshold,
              },
            ]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Selected-period stock position</h2>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {v.periodPosition?.eligible ? (
              <>
                <Stat
                  label="Opening on hand"
                  value={String(v.periodPosition.openingOnHand)}
                />
                <Stat
                  label="Closing on hand"
                  value={String(v.periodPosition.closingOnHand)}
                />
              </>
            ) : (
              <p>
                {v.periodPosition?.reason ??
                  "Reliable stock history is unavailable for this period."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold">Stock-out history</h2>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {v.historicalStockOuts.length ? (
              v.historicalStockOuts.map((entry) => (
                <div key={entry.productId}>
                  <p className="font-medium text-slate-900">{entry.name}</p>
                  {entry.eligible ? (
                    <ul className="mt-1 grid gap-1 text-slate-600">
                      {entry.intervals.map((interval) => (
                        <li key={`${entry.productId}-${interval.from}`}>
                          {interval.from} – {interval.to} ({interval.days} day
                          {interval.days === 1 ? "" : "s"}
                          {interval.ongoing ? ", ongoing" : ""})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-slate-500">{entry.reason}</p>
                  )}
                </div>
              ))
            ) : (
              <p className="text-slate-500">
                No product was out of stock in this period.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <h2 className="font-semibold">Turnover</h2>
            <p className="mt-1 text-sm text-slate-500">
              Units sold ÷ average stock on hand. A higher figure means stock
              sells through faster.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <SortableTable
            caption="Inventory turnover"
            rows={v.turnover}
            rowKey={(row) => row.productId}
            initialSort={{ key: "ratio", direction: "desc" }}
            emptyMessage="No products to report turnover for."
            columns={[
              {
                key: "name",
                label: "Product",
                sortValue: (row) => row.name,
                render: (row) => (
                  <div className="grid gap-0.5">
                    <span className="font-medium text-slate-950">
                      {row.name}
                    </span>
                    {row.reason ? (
                      <span className="text-xs text-slate-500">
                        {row.reason}
                      </span>
                    ) : null}
                  </div>
                ),
              },
              {
                key: "unitsSold",
                label: "Units sold",
                numeric: true,
                sortValue: (row) => row.unitsSold,
                render: (row) => row.unitsSold,
              },
              {
                key: "average",
                label: "Average stock",
                numeric: true,
                sortValue: (row) => row.averageDailyOnHand ?? -1,
                render: (row) =>
                  row.averageDailyOnHand === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    row.averageDailyOnHand.toFixed(1)
                  ),
              },
              {
                key: "ratio",
                label: "Turnover",
                numeric: true,
                sortValue: (row) => row.turnoverRatio ?? -1,
                render: (row) =>
                  row.turnoverRatio === null ? (
                    <span className="font-sans text-slate-500">
                      Not available
                    </span>
                  ) : (
                    <span className="font-semibold text-slate-950">
                      {row.turnoverRatio.toFixed(2)}×
                    </span>
                  ),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

type InventoryData = GeneralAnalyticsResponse["inventory"];
type StockRow = InventoryData["fastMoving"][number];
type BadgeTone = "neutral" | "success" | "info" | "warning" | "danger";

/** How close to the reorder level still counts as "running low". */
const RUNNING_LOW_MARGIN = 5;

function stockStatus(row: StockRow): {
  label: string;
  tone: BadgeTone;
  rank: number;
} {
  const availableNow = available(row);
  if (availableNow <= 0)
    return { label: "Out of stock", tone: "warning", rank: 0 };
  if (availableNow <= row.lowStockThreshold)
    return { label: "Reorder", tone: "warning", rank: 1 };
  if (availableNow <= row.lowStockThreshold + RUNNING_LOW_MARGIN)
    return { label: "Running low", tone: "info", rank: 2 };
  if (row.unitsSold === 0)
    return { label: "Not selling", tone: "neutral", rank: 3 };
  return { label: "In stock", tone: "success", rank: 4 };
}

/** Available stock; derived from on hand minus reserved if a row predates the field. */
function available(row: StockRow) {
  return typeof row.availableQuantity === "number"
    ? row.availableQuantity
    : Math.max(0, row.onHandQuantity - (row.reservedQuantity ?? 0));
}

/** Whole days of stock left at the period's selling pace, when it has one. */
function daysOfCover(row: StockRow) {
  if (!(row.unitsPerDay > 0)) return null;
  return Math.floor(available(row) / row.unitsPerDay);
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

type Issue = {
  key: string;
  name: string;
  kind: string;
  tone: BadgeTone;
  detail: string;
  action: string;
};

function attentionIssues(v: InventoryData): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  const add = (row: StockRow, issue: Omit<Issue, "key" | "name">) => {
    if (seen.has(row.productId)) return;
    seen.add(row.productId);
    issues.push({ key: row.productId, name: row.name, ...issue });
  };
  const pace = (row: StockRow) => {
    const cover = daysOfCover(row);
    return cover === null
      ? "."
      : `. About ${plural(cover, "day")} left at the current pace.`;
  };
  for (const row of v.currentStockOuts)
    add(row, {
      kind: "Out of stock",
      tone: "warning",
      detail: row.unitsSold
        ? `Nothing available. ${plural(row.unitsSold, "unit")} sold in this period, so sales are being missed.`
        : "Nothing available to sell.",
      action: "Restock now",
    });
  for (const row of v.atOrBelowMinimum)
    add(row, {
      kind: "Below reorder level",
      tone: "warning",
      detail: `${available(row)} available against a reorder level of ${row.lowStockThreshold}${
        row.reservedQuantity ? ` (${row.reservedQuantity} reserved)` : ""
      }${pace(row)}`,
      action: "Reorder this week",
    });
  for (const row of v.approachingMinimum)
    add(row, {
      kind: "Close to reorder level",
      tone: "info",
      detail: `${available(row)} available, reorder level ${row.lowStockThreshold}${pace(row)}`,
      action: "Plan the next order",
    });
  for (const row of v.stockedButUnsold)
    add(row, {
      kind: "Not selling",
      tone: "neutral",
      detail: `${row.onHandQuantity} in stock and no sales in this period.`,
      action: "Review price or placement",
    });
  return issues;
}

const ATTENTION_LIMIT = 8;

/**
 * Stock issues as one numbered list, most urgent first, each with what is
 * wrong, the figures behind it and the next step, so the merchant can work
 * down it rather than decode four separate sentences.
 */
function NeedsAttention({ inventory }: { inventory: InventoryData }) {
  const issues = attentionIssues(inventory);
  const visible = issues.slice(0, ATTENTION_LIMIT);
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-slate-100">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">
            Needs attention
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Stock issues to act on, most urgent first.
          </p>
        </div>
        <Badge tone={issues.length ? "warning" : "success"}>
          {issues.length ? plural(issues.length, "issue") : "All clear"}
        </Badge>
      </CardHeader>
      <CardContent className="pt-4">
        {visible.length ? (
          <ol className="grid divide-y divide-slate-100">
            {visible.map((issue, index) => (
              <li
                key={issue.key}
                className="grid grid-cols-[2rem_1fr] gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[2rem_1fr_auto]"
              >
                <span
                  aria-hidden="true"
                  className="flex size-7 items-center justify-center rounded-full bg-slate-100 font-mono text-sm font-semibold tabular-nums text-slate-700"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-950">
                      {issue.name}
                    </span>
                    <Badge tone={issue.tone}>{issue.kind}</Badge>
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{issue.detail}</p>
                </div>
                <p className="col-start-2 text-sm font-medium text-slate-950 sm:col-start-3 sm:self-center sm:text-right">
                  {issue.action}
                </p>
              </li>
            ))}
            {issues.length > ATTENTION_LIMIT ? (
              <li className="pt-3 text-sm text-slate-500">
                and {issues.length - ATTENTION_LIMIT} more, listed under Current
                stock by product below.
              </li>
            ) : null}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">
            Nothing needs attention: every product is above its reorder level
            and selling.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Units per category as labelled horizontal bars, largest first. */
function CategoryUnits({ rows }: { rows: InventoryData["byCategory"] }) {
  const sorted = [...rows].sort((a, b) => b.unitsSold - a.unitsSold);
  const total = sorted.reduce((sum, row) => sum + row.unitsSold, 0);
  const max = Math.max(1, ...sorted.map((row) => row.unitsSold));
  if (!sorted.length) return null;
  return (
    <ul className="grid gap-2.5" aria-label="Units sold by category">
      {sorted.map((row) => (
        <li
          key={row.category}
          className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3 text-sm"
        >
          <span className="truncate font-medium text-slate-950">
            {row.category}
          </span>
          <span className="h-3 overflow-hidden rounded-sm bg-slate-100">
            <span
              className="block h-full rounded-sm bg-blue-400"
              style={{ width: `${Math.max(2, (row.unitsSold / max) * 100)}%` }}
            />
          </span>
          <span className="w-28 text-right font-mono tabular-nums text-slate-700">
            {row.unitsSold}{" "}
            <span className="text-slate-400">
              ({total ? Math.round((row.unitsSold / total) * 100) : 0}%)
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function CombinedSection({ data }: { data: GeneralAnalyticsResponse }) {
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      <Alert>{data.combined.stockScopeNote}</Alert>
      <div className="grid gap-4 lg:grid-cols-2">
        {data.combined.analyses.map((analysis) => (
          <Card key={analysis.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <h2 className="font-semibold text-slate-950">{analysis.title}</h2>
              {analysis.reliable ? null : (
                <Badge tone="warning">Not enough data</Badge>
              )}
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <p className="leading-6 text-slate-700">{analysis.explanation}</p>
              {analysis.figures.length ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {analysis.figures.map((figure) => (
                    <div key={figure.key} className="contents">
                      <dt className="text-slate-500">{figure.label}</dt>
                      <dd className="text-right font-mono tabular-nums text-slate-800">
                        {figure.unit === "minor_currency"
                          ? euros(figure.value)
                          : figure.unit === "percent"
                            ? `${figure.value}%`
                            : figure.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {analysis.caveats.map((caveat) => (
                <p key={caveat} className="text-xs text-slate-500">
                  {caveat}
                </p>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        These readings are produced by fixed rules from the transaction and
        inventory figures, not by a model.
      </p>
    </div>
  );
}
