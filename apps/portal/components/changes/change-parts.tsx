"use client";

import type { ChangeCaseSummary, ChangeValue } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { cn } from "@repo/ui/cn";
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Clock,
  Info,
  PackageX,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  RESOLUTION_LABELS,
  changeKind,
  formatChangeValue,
  formatDateTime,
  formatLocalDate,
  formatPeriod,
  type Notice,
  type Tone,
} from "@/lib/changes";

const NOTICE_STYLE: Record<Tone, { className: string; icon: LucideIcon }> = {
  neutral: { className: "", icon: Clock },
  info: { className: "border-blue-200 bg-blue-50 text-blue-900", icon: Info },
  success: { className: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CircleCheck },
  warning: { className: "border-amber-200 bg-amber-50 text-amber-900", icon: TriangleAlert },
  danger: { className: "border-red-200 bg-red-50 text-red-800", icon: CircleAlert },
};

/**
 * One compact status note: icon, one-line title, optional detail. `role="note"`
 * so routine re-renders are not announced; significant changes go through the
 * page's single polite live region instead.
 */
export function NoticeBox({ notice, action }: { notice: Notice; action?: React.ReactNode }) {
  const style = NOTICE_STYLE[notice.tone];
  const Icon = style.icon;
  return (
    <Alert role="note" data-notice={notice.id} className={cn("flex gap-3 p-3", style.className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="grid min-w-0 gap-1">
        <p className="font-medium">{notice.title}</p>
        {notice.body ? <p>{notice.body}</p> : null}
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    </Alert>
  );
}

const KIND_ICON: Partial<Record<ChangeCaseSummary["type"], LucideIcon>> = {
  unit_demand_increase: TrendingUp,
  transaction_velocity_increase: TrendingUp,
  unit_demand_decrease: TrendingDown,
  transaction_velocity_decrease: TrendingDown,
};

/** What kind of change, in words and an icon, never colour alone. */
export function KindBadge({ change }: { change: ChangeCaseSummary }) {
  const kind = changeKind(change);
  const Icon =
    KIND_ICON[change.type] ??
    (kind.label === "Out of stock" ? PackageX : kind.tone === "warning" ? TriangleAlert : Info);
  return (
    <Badge tone={kind.tone} className="gap-1">
      <Icon className="size-3.5" aria-hidden="true" />
      {kind.label}
    </Badge>
  );
}

export function StateBadge({ change }: { change: ChangeCaseSummary }) {
  return change.status === "active" ? (
    <Badge tone="neutral" className="gap-1 bg-white ring-1 ring-slate-200">
      <CircleDot className="size-3.5" aria-hidden="true" />
      Active
    </Badge>
  ) : (
    <Badge tone="success" className="gap-1">
      <CircleCheck className="size-3.5" aria-hidden="true" />
      Resolved
    </Badge>
  );
}

export function ProductLabel({ change }: { change: ChangeCaseSummary }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="[overflow-wrap:anywhere]">{change.productName ?? "Product no longer listed"}</span>
      {change.productId && !change.productAvailable ? (
        <Badge tone="neutral">Archived or unavailable</Badge>
      ) : null}
    </span>
  );
}

/** Saved before/after values side by side, each with its own label and unit. */
export function BeforeAfter({
  before,
  after,
  size = "compact",
}: {
  before: ChangeValue[];
  after: ChangeValue[];
  size?: "compact" | "full";
}) {
  if (!before.length && !after.length) return null;
  const column = (title: string, values: ChangeValue[]) => (
    <div className="min-w-0">
      <p
        className={cn(
          "font-medium text-slate-500",
          size === "compact" ? "text-xs" : "text-sm",
        )}
      >
        {title}
      </p>
      {values.length ? (
        <dl className="mt-1 grid gap-1.5">
          {values.map((value) => (
            <div key={value.key} className="min-w-0">
              <dt className="text-xs text-slate-500">{value.label}</dt>
              <dd
                className={cn(
                  "text-slate-950 [overflow-wrap:anywhere]",
                  typeof value.value === "number" && "font-mono tabular-nums",
                  size === "compact" ? "text-sm" : "text-base font-semibold",
                )}
                data-value-key={value.key}
              >
                {formatChangeValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1 text-sm text-slate-500">No earlier reading</p>
      )}
    </div>
  );
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 rounded-lg bg-slate-50",
        size === "compact" ? "p-3" : "p-4",
      )}
    >
      {column("Before", before)}
      <ArrowRight className="mt-6 size-4 text-slate-400" aria-hidden="true" />
      {column("Now", after)}
    </div>
  );
}

/** When it was detected and which recorded period it is based on. */
export function ChangeTiming({ change, timezone }: { change: ChangeCaseSummary; timezone: string }) {
  const parts = [
    change.identifiedDuringInitialAnalysis
      ? `Identified during initial analysis, ${formatDateTime(change.firstDetectedAt, timezone)}`
      : `Detected ${formatDateTime(change.firstDetectedAt, timezone)}`,
    change.observation ? `Based on ${formatPeriod(change.observation)}` : null,
    change.status === "resolved" && change.resolvedAt
      ? `Resolved ${formatDateTime(change.resolvedAt, timezone)}${
          change.resolution ? ` · ${RESOLUTION_LABELS[change.resolution]}` : ""
        }`
      : null,
    change.notRecheckedSince
      ? `Not re-checked since ${formatLocalDate(change.notRecheckedSince)}`
      : null,
  ].filter(Boolean);
  return <p className="text-xs text-slate-500">{parts.join(" · ")}</p>;
}

/** One entry of the Changes list (§3.3). */
export function ChangeEntry({ change, timezone }: { change: ChangeCaseSummary; timezone: string }) {
  const headingId = `change-${change.id}`;
  return (
    <article aria-labelledby={headingId} className="grid gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm font-medium text-slate-600">
          <ProductLabel change={change} />
        </p>
        <div className="flex flex-wrap gap-2">
          <KindBadge change={change} />
          <StateBadge change={change} />
        </div>
      </div>
      <div className="grid gap-1">
        <h3 id={headingId} className="text-base font-semibold text-slate-950 [overflow-wrap:anywhere]">
          {change.headline}
        </h3>
        {change.summary ? <p className="text-sm text-slate-600">{change.summary}</p> : null}
      </div>
      <BeforeAfter before={change.before} after={change.after} />
      {change.consequence || change.suggestedAction ? (
        <p className="text-sm text-slate-800">
          {[change.consequence, change.suggestedAction].filter(Boolean).join(" ")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <ChangeTiming change={change} timezone={timezone} />
        <Link
          href={`/analytics/changes/${change.id}`}
          aria-describedby={headingId}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold text-blue-700 transition-colors hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          View explanation
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
