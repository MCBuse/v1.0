"use client";

import type { MerchantAnalytics } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Button } from "@repo/ui/button";
import { Skeleton } from "@repo/ui/skeleton";
import { usePortalResource } from "@/lib/client/use-portal-resource";
import { AnalyticsFilters, useAnalyticsFilters } from "./analytics-filters";
import { InventoryAnalyticsCards } from "./inventory-analytics-cards";
import { MerchantInsightsPanel } from "./merchant-insights";

export function InventoryAnalytics() {
  const filters = useAnalyticsFilters();
  const resource = usePortalResource<MerchantAnalytics>(filters.path);
  const data = resource.data;

  return (
    <section className="grid gap-6" aria-labelledby="inventory-analytics">
      <div>
        <h2
          id="inventory-analytics"
          className="text-xl font-semibold text-slate-950"
        >
          Inventory analytics
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Stock value, selling performance and stock risks. These figures are
          also available on Analytics.
        </p>
      </div>
      <AnalyticsFilters filters={filters} />
      {resource.error ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <p>
            {data
              ? "Inventory analytics could not refresh. Showing the last loaded figures."
              : "Inventory analytics could not load. You can still manage your products above."}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void resource.refresh()}
          >
            Retry analytics
          </Button>
        </Alert>
      ) : null}
      {resource.loading && !data ? <Skeleton className="h-64" /> : null}
      {data ? (
        <>
          <p className="text-xs text-slate-500">
            {new Intl.DateTimeFormat("en-GB", {
              dateStyle: "medium",
              timeZone: data.period.timezone,
            }).format(new Date(data.period.from))}
            {" – "}
            {new Intl.DateTimeFormat("en-GB", {
              dateStyle: "medium",
              timeZone: data.period.timezone,
            }).format(new Date(data.period.to))}
            {" · "}
            {data.period.timezone}
            {data.period.partialCurrentDay ? " · current day is partial" : ""}
          </p>
          <InventoryAnalyticsCards data={data} />
        </>
      ) : null}
      <MerchantInsightsPanel inventoryOnly />
    </section>
  );
}
