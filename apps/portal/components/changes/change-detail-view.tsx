"use client";

import type {
  ChangeDetailResponse,
  ChangeEvidenceEnvironment,
  ChangeIntelligenceSettings,
  ChangeValue,
} from "@repo/shared";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { EmptyState } from "@repo/ui/empty-state";
import { Skeleton } from "@repo/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import { ArrowLeft, ArrowRight, ChevronDown, Minus, Package, PackageCheck, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { AnalyticsNav } from "@/components/analytics-nav";
import {
  ENVIRONMENT_LABELS,
  formatChangeValue,
  formatCount,
  formatDateTime,
  formatPeriod,
  isUuid,
  processingNotice,
  withUnit,
} from "@/lib/changes";
import { usePolledResource } from "@/lib/client/use-polled-resource";
import { BeforeAfter, ChangeTiming, KindBadge, NoticeBox, ProductLabel, StateBadge } from "./change-parts";
import { ChangesUnavailable, useChangeStatus } from "./changes-view";

const BUSINESS_PROFILE = "/credit-assessment/business-profile";

/**
 * One change, directly linkable (plan §3.5): what changed, its impact, the
 * saved before/after values, the existing action, how it was calculated and
 * where the records came from.
 */
export function ChangeDetailView({ changeId }: { changeId: string }) {
  const status = useChangeStatus();
  const valid = isUuid(changeId);
  const detail = usePolledResource<ChangeDetailResponse>(
    valid && !status.unavailable ? `me/changes/${changeId}` : null,
    status.data?.processing === "processing" ? 5_000 : 60_000,
  );
  const data = detail.data;
  const notFound = !valid || (!data && detail.errorStatus === 404);
  const offline = status.offline || detail.offline;
  const processing = status.data ? processingNotice(status.data) : null;

  if (status.unavailable)
    return (
      <div className="grid min-w-0 gap-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Change details</h1>
        <AnalyticsNav />
        <ChangesUnavailable status={status.data} />
      </div>
    );

  if (notFound)
    return (
      <div className="grid min-w-0 gap-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Change details</h1>
        <AnalyticsNav />
        <Card>
          <EmptyState
            title="This change could not be found"
            description="It may belong to another account, or the link may be incomplete."
            action={
              <Button asChild variant="secondary">
                <Link href="/analytics/changes">Back to Changes</Link>
              </Button>
            }
          />
        </Card>
      </div>
    );

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/analytics/changes" className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-slate-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to Changes
        </Link>
        <AnalyticsNav />
      </div>
      {data ? (
        <div className="grid gap-3 border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 [overflow-wrap:anywhere]">
            {data.change.headline}
          </h1>
          <p className="text-sm text-slate-600"><ProductLabel change={data.change} /></p>
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge change={data.change} />
            <StateBadge change={data.change} />
            {status.data?.provenance.account === "sample" ? <Badge tone="neutral">Sample account</Badge> : null}
          </div>
          <ChangeTiming change={data.change} timezone={data.calculation.timezone} />
        </div>
      ) : (
        <div className="grid gap-2" aria-hidden={!detail.error}>
          <Skeleton className="h-5 w-40" />
          {detail.error ? (
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Change details</h1>
          ) : (
            <Skeleton className="h-9 w-3/4" />
          )}
          <Skeleton className="h-6 w-48 rounded-full" />
          <Skeleton className="h-4 w-64" />
        </div>
      )}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {status.announcement}
      </p>

      {offline ? (
        <NoticeBox
          notice={{
            id: "offline",
            tone: "warning",
            title: "You appear to be offline.",
            body: "The information below is what was last loaded. It updates when the connection returns.",
          }}
        />
      ) : null}
      {processing ? <NoticeBox notice={processing} /> : null}
      {detail.error && !offline ? (
        <NoticeBox
          notice={{
            id: "detail-failed",
            tone: "warning",
            title: data ? "The latest refresh failed." : "This change could not be loaded.",
            body: data
              ? "The details below are the ones that last loaded."
              : "This is a problem reading the change, not a sign that it was removed.",
          }}
          action={
            <Button variant="secondary" onClick={() => void detail.refresh()}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Try again
            </Button>
          }
        />
      ) : null}

      {data ? <DetailSections data={data} /> : detail.error ? null : <DetailSkeleton />}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid gap-6" aria-hidden="true">
      {["h-32", "h-24", "h-28", "h-20"].map((height) => (
        <div key={height} className="grid gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className={`w-full ${height}`} />
        </div>
      ))}
    </div>
  );
}

function DetailSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid min-w-0 scroll-mt-28 gap-3">
      <h2 id={id} className="text-base font-semibold text-slate-950">{title}</h2>
      {children}
    </section>
  );
}

function DetailSections({ data }: { data: ChangeDetailResponse }) {
  return (
    <div className="grid min-w-0 gap-8">
      <div className="grid min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 p-5 sm:p-6"><WhatChanged data={data} /></div>
        <div className="min-w-0 border-t border-slate-200 bg-slate-50 p-5 sm:p-6 xl:border-l xl:border-t-0">
          <SuggestedAction data={data} />
        </div>
      </div>
      <DetailSection id="before-and-after" title={data.change.identifiedDuringInitialAnalysis ? "First assessment" : "Before and after"}>
        {data.change.identifiedDuringInitialAnalysis ? (
          <p className="max-w-prose text-sm leading-relaxed text-slate-600">This finding was identified during the first analysis. There is no earlier assessment to compare it with.</p>
        ) : <BeforeAfter before={data.change.before} after={data.change.after} size="full" />}
      </DetailSection>
      <Impact data={data} />
      <HowCalculated data={data} />
      <SourceInformation data={data} />
    </div>
  );
}

function WhatChanged({ data }: { data: ChangeDetailResponse }) {
  const { recent, usualWeekly, baselineWeeks } = data.whatChanged;
  const unit = usualWeekly?.unit === "sales" || recent?.unit === "sales" ? "sales" : "units";
  const period = data.calculation.recentWindow ?? data.change.observation;
  const stockReadings = data.change.type === "stock_risk"
    ? data.impact.flatMap((step) => step.after && ["available", "minimum", "days_to_minimum"].includes(step.after.key) ? [step.after] : [])
    : [];
  const available = stockReadings.find((value) => value.key === "available");
  const minimum = stockReadings.find((value) => value.key === "minimum");
  const deficit = typeof available?.value === "number" && typeof minimum?.value === "number"
    ? minimum.value - available.value : null;
  return (
    <DetailSection id="what-changed" title="What changed">
      {data.change.summary ? <p className="max-w-prose text-base leading-relaxed text-slate-700">{data.change.summary}</p> : null}
      {stockReadings.length ? (
        <div className="grid gap-5 pt-2">
          <dl className="grid grid-cols-2 gap-6">
            {stockReadings.filter((value) => value.key !== "days_to_minimum").map((value) => (
              <div key={value.key} className="min-w-0">
                <dt className="text-sm text-slate-600">{value.key === "available" ? "Available stock" : value.label}</dt>
                <dd className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${value.key === "available" && deficit !== null && deficit > 0 ? "text-amber-800" : "text-slate-950"}`}>{formatChangeValue(value)}</dd>
              </div>
            ))}
          </dl>
          {deficit !== null && deficit > 0 ? (
            <p className="flex items-center gap-2 text-sm font-medium text-amber-800"><TriangleAlert className="size-4 shrink-0" aria-hidden="true" />{withUnit(deficit, "units")} below minimum stock</p>
          ) : null}
          {stockReadings.filter((value) => value.key === "days_to_minimum").map((value) => (
            <p key={value.key} className="border-t border-slate-100 pt-4 text-sm leading-relaxed text-slate-600">
              {value.value === null ? <>Stock projection unavailable · {formatChangeValue(value)}</> : <>{value.label}: <span className="font-medium text-slate-950">{formatChangeValue(value)}</span></>}
            </p>
          ))}
        </div>
      ) : recent || usualWeekly ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          {recent ? (
            <Figure
              label={recent.label}
              value={formatChangeValue(recent)}
              hint={period ? formatPeriod(period) : undefined}
            />
          ) : null}
          {usualWeekly ? (
            <Figure
              label={usualWeekly.label}
              value={formatChangeValue(usualWeekly)}
              hint={
                data.calculation.baselineWeeksUsed
                  ? `Average of the ${withUnit(data.calculation.baselineWeeksUsed, "weeks")} below`
                  : undefined
              }
            />
          ) : null}
        </dl>
      ) : null}
      {baselineWeeks.length ? (
        <Card className="overflow-hidden">
          <Table>
            <caption className="px-5 pt-4 text-left text-sm font-medium text-slate-950">
              Usual weeks used for comparison
            </caption>
            <TableHeader>
              <tr>
                <TableHead scope="col">Week</TableHead>
                <TableHead scope="col" className="px-4 py-3 text-right font-semibold">
                  Recorded {unit}
                </TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {baselineWeeks.map((week) => (
                <TableRow key={week.from}>
                  <th scope="row" className="px-4 py-3 text-left font-medium text-slate-950">
                    {formatPeriod(week)}
                  </th>
                  <TableCell className="py-3 text-right font-mono tabular-nums">
                    {withUnit(week.value, unit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </DetailSection>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 py-1">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-950 [overflow-wrap:anywhere]">
        {value}
      </dd>
      {hint ? <dd className="mt-1 text-xs text-slate-500">{hint}</dd> : null}
    </div>
  );
}

const show = (value: ChangeValue | null) => (value ? formatChangeValue(value) : "Not recorded");

function Impact({ data }: { data: ChangeDetailResponse }) {
  const firstCalculation = data.impact.length > 0 && data.impact.every((step) => step.before === null);
  return (
    <DetailSection
      id="impact"
      title={data.change.type === "stock_risk" ? "Why this stock warning appeared" : "Why this change appeared"}
    >
      <p className="max-w-prose text-sm leading-relaxed text-slate-600">
        {firstCalculation
          ? "These are the first saved readings for this analysis. They establish a starting point; they do not show a change from an earlier reading."
          : "The saved readings behind this finding. Compare the previous reading with the value used in this analysis."}
      </p>
      {data.impact.length ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_8rem] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-medium text-slate-600 md:grid">
            <span>Reading</span><span>Value in this analysis</span><span>Status</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.impact.map((step, index) => {
              const initial = step.before === null && step.after !== null;
              return (
                <li key={`${step.label}-${index}`} className="grid min-w-0 gap-2 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_8rem] md:items-center md:gap-4">
                  <p className="text-sm font-medium text-slate-950 [overflow-wrap:anywhere]">{step.label}</p>
                  <div className="min-w-0 text-sm [overflow-wrap:anywhere]">
                    {step.changed && step.before ? (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular-nums">
                        <span className="text-slate-500"><span className="sr-only">Previous reading: </span>{show(step.before)}</span>
                        <ArrowRight className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                        <span className="font-medium text-slate-950"><span className="sr-only">to </span>{show(step.after)}</span>
                      </div>
                    ) : <p className="font-mono tabular-nums text-slate-950">{show(step.after ?? step.before)}</p>}
                  </div>
                  <p className={`inline-flex items-center gap-1.5 text-xs ${step.changed && !initial ? "font-medium text-blue-700" : "text-slate-500"}`}>
                    {initial ? "First calculation" : step.changed ? <><ArrowRight className="size-3.5" aria-hidden="true" /> Changed</> : <><Minus className="size-3.5" aria-hidden="true" /> Unchanged</>}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-slate-500">The saved calculation links this change to no other stock or sales reading.</p>
      )}
    </DetailSection>
  );
}

function SuggestedAction({ data }: { data: ChangeDetailResponse }) {
  const { change, actions } = data;
  const productId = change.productId;
  const href = (action: "edit" | "stock") => `/inventory?productId=${productId}&action=${action}`;
  const stockFirst = change.type === "stock_risk" || change.type === "stock_threshold_change";
  const action = (kind: "edit" | "stock", allowed: boolean) => {
    const label = kind === "edit" ? "View product" : "Review stock";
    const Icon = kind === "edit" ? Package : PackageCheck;
    const variant = (kind === "stock") === stockFirst ? "primary" : "secondary";
    return allowed && productId ? (
      <Button asChild variant={variant}>
        <Link href={href(kind)}>
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </Link>
      </Button>
    ) : (
      <Button variant={variant} disabled>
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </Button>
    );
  };
  return (
    <DetailSection id="suggested-action" title="Suggested action">
      <div className="grid gap-2 text-sm text-slate-700">
        {change.consequence ? <p>{change.consequence}</p> : null}
        <p className="font-medium text-slate-950">
          {change.suggestedAction ??
            (change.status === "resolved"
              ? "Nothing to do. This change is closed and kept for your records."
              : "No action is needed. This is for your information.")}
        </p>
      </div>
      {productId ? (
        <div className="flex flex-wrap gap-2">
          {stockFirst ? action("stock", actions.reviewStock) : action("edit", actions.viewProduct)}
          {stockFirst ? action("edit", actions.viewProduct) : action("stock", actions.reviewStock)}
        </div>
      ) : null}
      {!actions.viewProduct || !productId ? (
        <p className="text-sm text-slate-500">
          This product is archived or no longer available, so its actions are unavailable. The history of this change is kept.
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          Opening the product does not close this change. It closes when a later update shows the situation has changed.
        </p>
      )}
    </DetailSection>
  );
}

const SETTING_LINES: Array<(s: ChangeIntelligenceSettings) => string> = [
  (s) => `Recent sales are compared with ${s.baselineWeeksMin} to ${s.baselineWeeksMax} complete weeks before them.`,
  (s) => `A product needs at least ${withUnit(s.minExpectedWeekly, "units")} in a usual week to be assessed.`,
  (s) =>
    `A change is reported when it is at least ${withUnit(s.minAbsoluteDifference, "units")} and ${Math.round(s.minRelativeDifference * 100)} percent away from usual, for ${withUnit(s.confirmationDays, "days")} in a row.`,
  (s) => `Projections need at least ${withUnit(s.forecastMinUnits, "units")} sold in the last ${withUnit(s.forecastWindowDays, "days")}.`,
  (s) => `Stock is flagged when it may reach its minimum within ${withUnit(s.projectedRiskDays, "days")}.`,
  (s) => `Suggested quantities cover the next ${withUnit(s.replenishmentDays, "days")}.`,
];

function HowCalculated({ data }: { data: ChangeDetailResponse }) {
  const c = data.calculation;
  return (
    <section aria-labelledby="how-calculated">
      <details className="group rounded-xl border border-slate-200 bg-white">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:px-5 [&::-webkit-details-marker]:hidden">
          <h2 id="how-calculated" className="text-base font-semibold text-slate-950">
            How this was calculated
          </h2>
          <ChevronDown
            className="size-5 shrink-0 text-slate-500 group-open:rotate-180 motion-safe:transition-transform"
            aria-hidden="true"
          />
        </summary>
        <div className="grid gap-5 border-t border-slate-200 px-4 py-4 text-sm text-slate-700 sm:px-5">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Fact label="Calculated as of" value={formatDateTime(c.asOf, c.timezone)} />
            <Fact
              label="Business timezone"
              value={
                <>
                  {c.timezone}{" "}
                  <Link
                    href={`${BUSINESS_PROFILE}#business-timezone`}
                    className="inline-flex min-h-11 items-center font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    Change in Business profile
                  </Link>
                </>
              }
            />
            {c.recentWindow ? <Fact label="Recent period" value={formatPeriod(c.recentWindow)} /> : null}
            {c.baselineWeeksUsed ? (
              <Fact label="Usual weeks compared" value={withUnit(c.baselineWeeksUsed, "weeks")} />
            ) : null}
            {c.forecastWindow ? (
              <Fact label="Sales used for projections" value={formatPeriod(c.forecastWindow)} />
            ) : null}
            <Fact label="Calculation version" value={c.modelVersion} />
          </dl>
          <div>
            <h3 className="font-medium text-slate-950">Settings used</h3>
            <ul className="mt-2 grid list-disc gap-1 pl-5">
              {SETTING_LINES.map((line, index) => (
                <li key={index}>{line(c.settings)}</li>
              ))}
            </ul>
          </div>
          {c.assumptions.length ? (
            <div>
              <h3 className="font-medium text-slate-950">Assumptions</h3>
              <ul className="mt-2 grid list-disc gap-1 pl-5">
                {c.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-950 [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

const ENVIRONMENTS: ChangeEvidenceEnvironment[] = ["live", "test", "synthetic", "unknown"];

function SourceInformation({ data }: { data: ChangeDetailResponse }) {
  const s = data.source;
  const digital = ENVIRONMENTS.filter((env) => (s.digitalSalesByEnvironment[env] ?? 0) > 0);
  return (
    <DetailSection id="source-information" title="Source information">
      <Card>
        <CardContent className="pt-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {digital.length ? (
              digital.map((env) => (
                <Fact key={env} label={ENVIRONMENT_LABELS[env]} value={withUnit(s.digitalSalesByEnvironment[env]!, "sales")} />
              ))
            ) : (
              <Fact label="Digital payments" value="None recorded" />
            )}
            <Fact
              label="Cash sales"
              value={`${withUnit(s.cashSales, "sales")} · live or test not recorded`}
            />
            {s.excludedObservations ? (
              <Fact label="Records not used" value={formatCount(s.excludedObservations)} />
            ) : null}
          </dl>
        </CardContent>
      </Card>
      {s.limitations.length ? (
        <ul className="grid list-disc gap-1 pl-5 text-sm text-slate-600">
          {s.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      ) : null}
    </DetailSection>
  );
}
