"use client";

import type { MerchantInsight, MerchantInsightsResponse } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Skeleton } from "@repo/ui/skeleton";
import { RefreshCw } from "lucide-react";
import { usePortalResource } from "@/lib/client/use-portal-resource";

const tone = (
  kind: MerchantInsight["kind"],
): "danger" | "warning" | "info" | "neutral" =>
  kind === "discrepancy"
    ? "danger"
    : kind === "stock_risk" || kind === "anomaly"
      ? "warning"
      : "info";

/** Business insights for Deep analytics: every current insight, with freshness. */
export function MerchantInsightsPanel() {
  const resource = usePortalResource<MerchantInsightsResponse>(
    "me/insights",
    60_000,
  );
  const headingId = "analytics-insights";

  if (resource.loading && !resource.data) return <Skeleton className="h-40" />;
  const data = resource.data;

  // N.14 — a failed fetch used to fall through to `return null`, so a route the
  // proxy was refusing looked exactly like a merchant with nothing to say. It
  // now says what went wrong and offers a retry.
  if (!data && resource.error)
    return (
      <section className="grid gap-3" aria-labelledby={headingId}>
        <h2 id={headingId} className="font-semibold text-slate-950">
          Business insights
        </h2>
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-semibold">Insights could not be loaded.</p>
          <p className="mt-1">
            {resource.offline
              ? "You appear to be offline. They will return when the connection does."
              : resource.error.message}
          </p>
          <p className="mt-1 text-xs">
            This is a problem reading them, not a finding that there is nothing
            to report.
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
      </section>
    );

  if (!data || data.status === "disabled") return null;
  if (data.status === "updating")
    return (
      <Alert className="border-blue-200 bg-blue-50 text-blue-900">
        {data.message ?? "Business insights are being prepared."}
      </Alert>
    );
  const insights = data.insights;
  const calculationPeriod =
    data.scope.periodFrom && data.scope.periodTo
      ? `${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(data.scope.periodFrom))} – ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(data.scope.periodTo))}`
      : "Period unavailable";
  return (
    <section className="grid gap-3" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={headingId} className="font-semibold text-slate-950">
            Business insights
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
      {resource.error ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          These insights are the last ones that loaded; the most recent refresh
          failed.
        </Alert>
      ) : null}
      {data.backlog ? (
        <p className="text-sm text-amber-800">
          Refresh {data.backlog.status} · queued for {data.backlog.ageSeconds}s
          {data.backlog.reason ? ` · ${data.backlog.reason}` : ""}
        </p>
      ) : null}
      {data.lastFailure ? (
        <Alert className="border-red-200 bg-red-50 text-red-800">
          <p className="font-semibold">
            The last recalculation failed, so these figures may be out of date.
          </p>
          <p className="mt-1">
            {data.lastFailure.reason} · {data.lastFailure.attempts} attempt
            {data.lastFailure.attempts === 1 ? "" : "s"} since{" "}
            {new Intl.DateTimeFormat("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(data.lastFailure.at))}
          </p>
        </Alert>
      ) : null}
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
            No material changes or risks were detected in the latest
            calculation.
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
