"use client";

import type { MerchantInsight, MerchantInsightsResponse } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Skeleton } from "@repo/ui/skeleton";
import { usePortalResource } from "@/lib/client/use-portal-resource";

const tone = (
  kind: MerchantInsight["kind"],
): "danger" | "warning" | "info" | "neutral" =>
  kind === "discrepancy"
    ? "danger"
    : kind === "stock_risk" || kind === "anomaly"
      ? "warning"
      : "info";

export function MerchantInsightsPanel({
  limit,
  inventoryOnly = false,
}: {
  limit?: number;
  inventoryOnly?: boolean;
}) {
  const resource = usePortalResource<MerchantInsightsResponse>(
    "me/insights",
    60_000,
  );
  if (resource.loading && !resource.data) return <Skeleton className="h-40" />;
  const data = resource.data;
  if (!data || data.status === "disabled") return null;
  if (data.status === "updating")
    return (
      <Alert className="border-blue-200 bg-blue-50 text-blue-900">
        {data.message ?? "Business insights are being prepared."}
      </Alert>
    );
  const matchingInsights = inventoryOnly
    ? data.insights.filter(
        (insight) =>
          insight.kind === "stock_risk" ||
          insight.evidence.some(
            (fact) =>
              fact.id.startsWith("product:") ||
              fact.id.startsWith("category:") ||
              fact.id.startsWith("stock."),
          ),
      )
    : data.insights;
  const insights =
    typeof limit === "number"
      ? matchingInsights.slice(0, limit)
      : matchingInsights;
  const headingId = inventoryOnly
    ? "inventory-insights"
    : limit
      ? "overview-insights"
      : "analytics-insights";
  const calculationPeriod =
    data.scope.periodFrom && data.scope.periodTo
      ? `${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(data.scope.periodFrom))} – ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(data.scope.periodTo))}`
      : "Period unavailable";
  return (
    <section className="grid gap-3" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={headingId} className="font-semibold text-slate-950">
            {inventoryOnly ? "Inventory insights" : "Business insights"}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            All recorded activity · {calculationPeriod} · Last updated{" "}
            {data.generatedAt
              ? new Intl.DateTimeFormat("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(data.generatedAt))
              : "recently"}
          </p>
        </div>
        {data.stale ? (
          <Badge tone="warning">Update delayed</Badge>
        ) : (
          <Badge tone="success">Current</Badge>
        )}
      </div>
      {data.message ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          {data.message}
        </Alert>
      ) : null}
      {insights.length ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-5 text-sm text-slate-500">
            {inventoryOnly
              ? "No inventory changes or risks were detected in the latest calculation."
              : "No material changes or risks were detected in the latest calculation."}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function InsightCard({ insight }: { insight: MerchantInsight }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-slate-950">{insight.title}</h3>
          <Badge tone={tone(insight.kind)}>
            {insight.kind.replaceAll("_", " ")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p className="leading-6 text-slate-700">{insight.summary}</p>
        {insight.recommendation ? (
          <p className="rounded-md bg-slate-50 p-3 text-slate-700">
            <span className="font-medium text-slate-950">Consider: </span>
            {insight.recommendation}
          </p>
        ) : null}
        <div className="grid gap-1 text-xs text-slate-500">
          {insight.evidence.slice(0, 3).map((fact) => (
            <p key={fact.id}>
              <span className="font-medium text-slate-700">{fact.label}:</span>{" "}
              {fact.value}
            </p>
          ))}
        </div>
        {insight.limitations.length ? (
          <p className="text-xs leading-5 text-slate-500">
            {insight.limitations.join(" ")}
          </p>
        ) : null}
        <p className="text-[11px] uppercase tracking-wide text-slate-400">
          {insight.narrationSource === "groq"
            ? "AI wording · calculated facts"
            : "Calculated wording"}
        </p>
      </CardContent>
    </Card>
  );
}
