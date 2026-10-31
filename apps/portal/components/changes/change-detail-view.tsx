"use client";

import type {
  ChangeDetailResponse,
  ChangeEvidenceEnvironment,
  ChangeIntelligenceSettings,
  ChangeValue,
} from "@repo/shared";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { EmptyState } from "@repo/ui/empty-state";
import { Skeleton } from "@repo/ui/skeleton";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Package,
  PackageCheck,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
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
import { ChangeTiming, NoticeBox } from "./change-parts";
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
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
          Change details
        </h1>
        <AnalyticsNav />
        <ChangesUnavailable status={status.data} />
      </div>
    );

  if (notFound)
    return (
      <div className="grid min-w-0 gap-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
          Change details
        </h1>
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
      <Link
        href="/analytics/changes"
        className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-md text-sm font-medium text-slate-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to Changes
      </Link>
      {data ? (
        <div className="-mt-3 grid max-w-3xl gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 [overflow-wrap:anywhere]">
            {data.change.headline}
          </h1>
          {data.change.summary ? (
            <p className="text-lg text-slate-600">{data.change.summary}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <ChangeTiming
              change={data.change}
              timezone={data.calculation.timezone}
            />
            {data.change.productId && !data.change.productAvailable ? (
              <Badge tone="neutral">Archived or unavailable</Badge>
            ) : null}
            {status.data?.provenance.account === "sample" ? (
              <Badge tone="neutral">Sample account</Badge>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="-mt-3 grid gap-2" aria-hidden={!detail.error}>
          {detail.error ? (
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Change details
            </h1>
          ) : (
            <Skeleton className="h-9 w-3/4" />
          )}
          <Skeleton className="h-6 w-2/3" />
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
            title: data
              ? "The latest refresh failed."
              : "This change could not be loaded.",
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

      {data ? (
        <DetailSections data={data} />
      ) : detail.error ? null : (
        <DetailSkeleton />
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid gap-6" aria-hidden="true">
      <div className="grid gap-6 rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
        <Skeleton className="h-5 w-32" />
        <div className="flex gap-10">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-28" />
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}

/** A white ledger panel with a slate band heading, the same language as the Changes list. */
function Panel({
  id,
  title,
  aside,
  children,
  className = "",
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white ${className}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5 sm:px-5">
        <h2 id={id} className="text-sm font-semibold text-slate-950">
          {title}
        </h2>
        {aside ? <div className="text-xs text-slate-500">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

function DetailSections({ data }: { data: ChangeDetailResponse }) {
  return (
    <div className="grid min-w-0 gap-6">
      <div className="grid min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white lg:grid-cols-[minmax(0,1fr)_19rem]">
        <WhatChanged data={data} />
        <SuggestedAction data={data} />
      </div>
      <Impact data={data} />
      <SourceInformation data={data} />
      <HowCalculated data={data} />
    </div>
  );
}

/** Two large figures: where it was and where it is. */
function Comparison({
  from,
  to,
  urgent = false,
  reference,
}: {
  from: { label: string; value: string; hint?: string } | null;
  to: { label: string; value: string; hint?: string };
  urgent?: boolean;
  /** A fixed level shown after the figure, not an earlier reading: no arrow. */
  reference?: { label: string; value: string };
}) {
  const figure = (
    item: { label: string; value: string; hint?: string },
    now: boolean,
  ) => (
    <div className="min-w-0">
      <dt className="text-sm text-slate-500">{item.label}</dt>
      <dd
        className={`mt-1 font-mono text-3xl font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-4xl ${
          now ? (urgent ? "text-red-700" : "text-slate-950") : "text-slate-400"
        }`}
      >
        {item.value}
      </dd>
      {item.hint ? (
        <dd className="mt-1 text-xs text-slate-500">{item.hint}</dd>
      ) : null}
    </div>
  );
  return (
    <dl className="flex flex-wrap items-start gap-x-8 gap-y-4">
      {from ? (
        <>
          {figure(from, false)}
          <ArrowRight
            className="mt-9 hidden size-5 shrink-0 text-slate-300 sm:block"
            aria-hidden="true"
          />
        </>
      ) : null}
      {figure(to, true)}
      {reference ? figure(reference, false) : null}
    </dl>
  );
}

/**
 * The usual weeks and the recent period as bars from a zero baseline, with the
 * usual level marked. It is a real table, so the bars are also the table view.
 */
function WeeklyBars({
  weeks,
  recent,
  usual,
  period,
  unit,
}: {
  weeks: Array<{ from: string; to: string; value: number }>;
  recent: number | null;
  usual: number | null;
  period: { from: string; to: string } | null;
  unit: "units" | "sales";
}) {
  const rows = [
    ...[...weeks].reverse().map((week) => ({
      key: week.from,
      label: formatPeriod(week),
      value: week.value,
      now: false,
    })),
    ...(recent !== null && period
      ? [
          {
            key: "recent",
            label: formatPeriod(period),
            value: recent,
            now: true,
          },
        ]
      : []),
  ];
  const max = Math.max(...rows.map((row) => row.value), usual ?? 0, 1);
  const pct = (value: number) => `${(value / max) * 100}%`;
  return (
    <div className="grid gap-2">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <caption className="sr-only">
          Recorded {unit} per week, oldest first, ending with the last 7 days
        </caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Recorded {unit}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th
                scope="row"
                className={`w-32 whitespace-nowrap py-1 pr-4 text-left font-normal ${row.now ? "font-medium text-slate-950" : "text-slate-500"}`}
              >
                {row.now ? (
                  <span className="mr-1 text-blue-700">Last 7 days</span>
                ) : null}
                <span className={row.now ? "sr-only" : ""}>{row.label}</span>
              </th>
              <td className="py-1">
                <div className="flex items-center gap-3">
                  <div className="relative h-5 min-w-0 flex-1">
                    <div
                      className={`absolute inset-y-1 left-0 rounded-r ${row.now ? "bg-blue-600" : "bg-slate-400"}`}
                      style={{ width: pct(row.value) }}
                    />
                    {usual !== null ? (
                      <div
                        aria-hidden="true"
                        className="absolute -inset-y-1 w-px bg-slate-950/40"
                        style={{ left: pct(usual) }}
                      />
                    ) : null}
                  </div>
                  <span
                    className={`w-24 shrink-0 text-right font-mono tabular-nums ${row.now ? "font-semibold text-slate-950" : "text-slate-600"}`}
                  >
                    {withUnit(row.value, unit)}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {usual !== null ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <span aria-hidden="true" className="h-3 w-px bg-slate-950/40" />
          Usual week, {withUnit(usual, unit)}
        </p>
      ) : null}
    </div>
  );
}

function WhatChanged({ data }: { data: ChangeDetailResponse }) {
  const { change } = data;
  const { recent, usualWeekly, baselineWeeks } = data.whatChanged;
  const unit =
    usualWeekly?.unit === "sales" || recent?.unit === "sales"
      ? "sales"
      : "units";
  const period = data.calculation.recentWindow ?? change.observation;
  const urgent = change.status === "active" && change.priority <= 2;

  const stockReadings =
    change.type === "stock_risk"
      ? data.impact.flatMap((step) =>
          step.after &&
          ["available", "minimum", "days_to_minimum"].includes(step.after.key)
            ? [step.after]
            : [],
        )
      : [];
  const available = stockReadings.find((value) => value.key === "available");
  const minimum = stockReadings.find((value) => value.key === "minimum");
  const projection = stockReadings.find(
    (value) => value.key === "days_to_minimum",
  );
  const deficit =
    typeof available?.value === "number" && typeof minimum?.value === "number"
      ? minimum.value - available.value
      : null;

  let body: React.ReactNode = null;
  if (available || minimum) {
    body = (
      <div className="grid gap-4">
        <Comparison
          from={null}
          to={{
            label: "Available stock",
            value: available ? formatChangeValue(available) : "Not recorded",
          }}
          reference={
            minimum
              ? { label: "Minimum stock", value: formatChangeValue(minimum) }
              : undefined
          }
          urgent={deficit !== null && deficit > 0}
        />
        {deficit !== null && deficit > 0 ? (
          <p className="flex items-center gap-2 text-sm font-medium text-red-700">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            {withUnit(deficit, "units")} below minimum stock
          </p>
        ) : null}
        {projection ? (
          <p className="text-sm text-slate-600">
            {projection.value === null
              ? "Stock projection unavailable: "
              : `${projection.label}: `}
            <span className="font-medium text-slate-950">
              {formatChangeValue(projection)}
            </span>
          </p>
        ) : null}
      </div>
    );
  } else if (recent || usualWeekly) {
    body = (
      <div className="grid gap-6">
        <Comparison
          from={
            usualWeekly
              ? {
                  label: "Usual week",
                  value: formatChangeValue(usualWeekly),
                  hint: data.calculation.baselineWeeksUsed
                    ? `Average of ${withUnit(data.calculation.baselineWeeksUsed, "weeks")}`
                    : undefined,
                }
              : null
          }
          to={{
            label: "Last 7 days",
            value: recent ? formatChangeValue(recent) : "Not recorded",
            hint: period ? formatPeriod(period) : undefined,
          }}
        />
        {baselineWeeks.length ? (
          <WeeklyBars
            weeks={baselineWeeks}
            recent={typeof recent?.value === "number" ? recent.value : null}
            usual={
              typeof usualWeekly?.value === "number" ? usualWeekly.value : null
            }
            period={period}
            unit={unit}
          />
        ) : null}
      </div>
    );
  } else if (change.after[0]) {
    const before = change.before[0];
    body = (
      <Comparison
        from={
          before
            ? { label: before.label, value: formatChangeValue(before) }
            : null
        }
        to={{
          label: change.after[0].label,
          value: formatChangeValue(change.after[0]),
        }}
        urgent={urgent}
      />
    );
  }

  return (
    <section aria-labelledby="what-changed" className="min-w-0 p-5 sm:p-6">
      <h2
        id="what-changed"
        className="mb-5 text-sm font-semibold text-slate-950"
      >
        What changed
      </h2>
      {body ?? (
        <p className="text-sm text-slate-500">
          No figures were saved with this change.
        </p>
      )}
    </section>
  );
}

function Impact({ data }: { data: ChangeDetailResponse }) {
  const firstCalculation =
    data.impact.length > 0 && data.impact.every((step) => step.before === null);
  const cell = "min-w-0 text-sm tabular-nums [overflow-wrap:anywhere]";
  /** Figures in mono; worded values ("No recent sales") stay in the interface face. */
  const figure = (value: ChangeValue | null) =>
    typeof value?.value === "number" ? (
      <span className="font-mono">{show(value)}</span>
    ) : (
      show(value)
    );
  return (
    <Panel
      id="impact"
      title={
        data.change.type === "stock_risk"
          ? "Why this stock warning appeared"
          : "Why this change appeared"
      }
      aside={
        firstCalculation
          ? "First readings. They establish a starting point."
          : "Readings used in this analysis"
      }
    >
      {data.impact.length ? (
        <>
          <div
            aria-hidden="true"
            className="hidden grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-6 border-b border-slate-100 px-5 pt-3 pb-2 text-xs text-slate-500 sm:grid"
          >
            <span>Reading</span>
            <span className="text-right">Was</span>
            <span className="text-right">Now</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.impact.map((step, index) => {
              const initial = step.before === null && step.after !== null;
              const unchanged = !step.changed && !initial;
              return (
                <li
                  key={`${step.label}-${index}`}
                  className="grid grid-cols-2 gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-baseline sm:px-5"
                >
                  <p
                    className={`col-span-2 text-sm [overflow-wrap:anywhere] sm:col-span-1 ${unchanged ? "text-slate-500" : "font-medium text-slate-950"}`}
                  >
                    {step.label}
                  </p>
                  <p className={`${cell} text-slate-500 sm:text-right`}>
                    <span className="mr-1.5 font-sans text-xs sm:sr-only">
                      Was
                    </span>
                    {initial ? (
                      <span className="font-sans text-xs">
                        First calculation
                      </span>
                    ) : unchanged ? (
                      <span className="font-sans text-xs">Unchanged</span>
                    ) : (
                      figure(step.before)
                    )}
                  </p>
                  <p
                    className={`${cell} sm:text-right ${unchanged ? "text-slate-500" : "font-semibold text-slate-950"}`}
                  >
                    <span className="mr-1.5 font-sans text-xs font-normal text-slate-500 sm:sr-only">
                      Now
                    </span>
                    {figure(step.after ?? step.before)}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="px-4 py-4 text-sm text-slate-500 sm:px-5">
          The saved calculation links this change to no other stock or sales
          reading.
        </p>
      )}
    </Panel>
  );
}

const show = (value: ChangeValue | null) =>
  value ? formatChangeValue(value) : "Not recorded";

function SuggestedAction({ data }: { data: ChangeDetailResponse }) {
  const { change, actions } = data;
  const productId = change.productId;
  const href = (action: "edit" | "stock") =>
    `/inventory?productId=${productId}&action=${action}`;
  const stockFirst =
    change.type === "stock_risk" || change.type === "stock_threshold_change";
  const action = (kind: "edit" | "stock", allowed: boolean) => {
    const label = kind === "edit" ? "View product" : "Review stock";
    const Icon = kind === "edit" ? Package : PackageCheck;
    const variant = (kind === "stock") === stockFirst ? "primary" : "secondary";
    return allowed && productId ? (
      <Button asChild variant={variant} className="w-full">
        <Link href={href(kind)}>
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </Link>
      </Button>
    ) : (
      <Button variant={variant} disabled className="w-full">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </Button>
    );
  };
  return (
    <section
      aria-labelledby="suggested-action"
      className="grid min-w-0 content-start gap-4 border-t border-slate-200 bg-slate-50 p-5 sm:p-6 lg:border-t-0 lg:border-l"
    >
      <h2
        id="suggested-action"
        className="text-sm font-semibold text-slate-950"
      >
        Suggested action
      </h2>
      <div className="grid gap-2">
        <p className="text-base font-semibold text-slate-950">
          {change.suggestedAction ??
            (change.status === "resolved"
              ? "Nothing to do. This change is closed and kept for your records."
              : "No action is needed. This is for your information.")}
        </p>
        {change.consequence ? (
          <p className="text-sm text-slate-600">{change.consequence}</p>
        ) : null}
      </div>
      {productId ? (
        <div className="grid gap-2">
          {stockFirst
            ? action("stock", actions.reviewStock)
            : action("edit", actions.viewProduct)}
          {stockFirst
            ? action("edit", actions.viewProduct)
            : action("stock", actions.reviewStock)}
        </div>
      ) : null}
      <p className="text-xs text-slate-500">
        {!actions.viewProduct || !productId
          ? "This product is archived or no longer available, so its actions are unavailable. The history of this change is kept."
          : "This change closes by itself when a later update shows the situation has changed."}
      </p>
    </section>
  );
}

const SETTING_LINES: Array<(s: ChangeIntelligenceSettings) => string> = [
  (s) =>
    `Recent sales are compared with ${s.baselineWeeksMin} to ${s.baselineWeeksMax} complete weeks before them.`,
  (s) =>
    `A product needs at least ${withUnit(s.minExpectedWeekly, "units")} in a usual week to be assessed.`,
  (s) =>
    `A change is reported when it is at least ${withUnit(s.minAbsoluteDifference, "units")} and ${Math.round(s.minRelativeDifference * 100)} percent away from usual, for ${withUnit(s.confirmationDays, "days")} in a row.`,
  (s) =>
    `Projections need at least ${withUnit(s.forecastMinUnits, "units")} sold in the last ${withUnit(s.forecastWindowDays, "days")}.`,
  (s) =>
    `Stock is flagged when it may reach its minimum within ${withUnit(s.projectedRiskDays, "days")}.`,
  (s) =>
    `Suggested quantities cover the next ${withUnit(s.replenishmentDays, "days")}.`,
];

function HowCalculated({ data }: { data: ChangeDetailResponse }) {
  const c = data.calculation;
  return (
    <section aria-labelledby="how-calculated">
      <details className="group overflow-hidden rounded-lg border border-slate-200 bg-white">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 bg-slate-50 px-4 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 sm:px-5 [&::-webkit-details-marker]:hidden">
          <h2
            id="how-calculated"
            className="text-sm font-semibold text-slate-950"
          >
            How this was calculated
          </h2>
          <ChevronDown
            className="size-4 shrink-0 text-slate-500 group-open:rotate-180 motion-safe:transition-transform"
            aria-hidden="true"
          />
        </summary>
        <div className="grid gap-5 border-t border-slate-200 px-4 py-4 text-sm text-slate-700 sm:px-5">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Fact
              label="Calculated as of"
              value={formatDateTime(c.asOf, c.timezone)}
            />
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
            {c.recentWindow ? (
              <Fact
                label="Recent period"
                value={formatPeriod(c.recentWindow)}
              />
            ) : null}
            {c.baselineWeeksUsed ? (
              <Fact
                label="Usual weeks compared"
                value={withUnit(c.baselineWeeksUsed, "weeks")}
              />
            ) : null}
            {c.forecastWindow ? (
              <Fact
                label="Sales used for projections"
                value={formatPeriod(c.forecastWindow)}
              />
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
      <dd className="mt-0.5 text-slate-950 [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}

const ENVIRONMENTS: ChangeEvidenceEnvironment[] = [
  "live",
  "test",
  "synthetic",
  "unknown",
];

function SourceInformation({ data }: { data: ChangeDetailResponse }) {
  const s = data.source;
  const digital = ENVIRONMENTS.filter(
    (env) => (s.digitalSalesByEnvironment[env] ?? 0) > 0,
  );
  const rows: Array<[string, string]> = [
    ...(digital.length
      ? digital.map((env): [string, string] => [
          ENVIRONMENT_LABELS[env],
          withUnit(s.digitalSalesByEnvironment[env]!, "sales"),
        ])
      : [["Digital payments", "None recorded"] as [string, string]]),
    ["Cash sales", withUnit(s.cashSales, "sales")],
    ...(s.excludedObservations
      ? [
          ["Records not used", formatCount(s.excludedObservations)] as [
            string,
            string,
          ],
        ]
      : []),
  ];
  return (
    <Panel
      id="source-information"
      title="Source information"
      aside="Records this analysis read"
    >
      <dl className="divide-y divide-slate-100">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm sm:px-5"
          >
            <dt className="text-slate-600">{label}</dt>
            <dd className="font-mono tabular-nums text-slate-950">{value}</dd>
          </div>
        ))}
      </dl>
      <ul className="grid gap-1 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">
        <li>Cash sales do not record whether they were live or test.</li>
        {s.limitations.map((limitation) => (
          <li key={limitation}>{limitation}</li>
        ))}
      </ul>
    </Panel>
  );
}
