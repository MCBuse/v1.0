"use client";

import type { ChangeCaseSummary, ChangeValue } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { cn } from "@repo/ui/cn";
import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  RESOLUTION_LABELS,
  changeGroup,
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

/** Ledger columns from `sm` up: headline · Was · Now · age. The list's column header uses the same. */
export const LEDGER_COLUMNS = "sm:grid-cols-[minmax(0,1fr)_9rem_9rem_6.5rem]";

const relative = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto", style: "short" });
function age(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  const days = Math.round(ms / 86_400_000);
  if (days === 0) return relative.format(Math.round(ms / 3_600_000), "hour");
  return Math.abs(days) < 14 ? relative.format(days, "day") : relative.format(Math.round(days / 7), "week");
}

/** One saved value cell. Figures in mono and right-aligned; words left-aligned. */
function LedgerValue({ label, value, emphasis }: { label: string; value?: ChangeValue; emphasis?: "now" | "urgent" }) {
  const numeric = typeof value?.value === "number";
  return (
    <p className={cn("min-w-0 text-sm", numeric && "sm:text-right")}>
      <span className="mr-1.5 text-xs text-slate-500 sm:sr-only">{label}</span>
      {value ? (
        <span
          data-value-key={value.key}
          className={cn(
            "[overflow-wrap:anywhere]",
            numeric && "font-mono tabular-nums",
            !emphasis && "text-slate-500",
            emphasis === "now" && "font-medium text-slate-950",
            emphasis === "urgent" && "font-semibold text-red-700",
          )}
        >
          {formatChangeValue(value)}
        </span>
      ) : (
        <span className="text-slate-400">None recorded</span>
      )}
    </p>
  );
}

/**
 * One line of the Changes ledger (§3.3): the headline (which already names the
 * product and direction), the first saved before/now pair, and how long ago.
 * A second line appears only when it adds something: a stock summary, an
 * archived product, a resolution or a stale check. The whole row opens the
 * explanation.
 */
export function ChangeEntry({ change, timezone }: { change: ChangeCaseSummary; timezone: string }) {
  const headingId = `change-${change.id}`;
  const resolved = change.status === "resolved";
  const when = resolved && change.resolvedAt ? change.resolvedAt : change.lastChangedAt;
  const note = [
    changeGroup(change.type) === "stock" ? change.summary : null,
    change.productId && !change.productAvailable ? "Product archived or unavailable." : null,
    resolved && change.resolution ? `Resolved: ${RESOLUTION_LABELS[change.resolution]}.` : null,
    change.notRecheckedSince ? `Not re-checked since ${formatLocalDate(change.notRecheckedSince)}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <article aria-labelledby={headingId}>
      <Link
        href={`/analytics/changes/${change.id}`}
        aria-labelledby={headingId}
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 sm:items-baseline sm:px-5",
          LEDGER_COLUMNS,
        )}
      >
        <div className="min-w-0">
          <h4
            id={headingId}
            className={cn("text-sm font-medium [overflow-wrap:anywhere]", resolved ? "text-slate-600" : "text-slate-950")}
          >
            {change.headline}
          </h4>
          {note ? <p className="mt-0.5 text-sm text-slate-500">{note}</p> : null}
        </div>
        <div className="col-span-2 row-start-2 flex flex-wrap gap-x-6 gap-y-1 sm:contents">
          <LedgerValue label="Was" value={change.before[0]} />
          <LedgerValue
            label="Now"
            value={change.after[0]}
            emphasis={!resolved && change.priority <= 2 ? "urgent" : "now"}
          />
        </div>
        <p className="col-start-2 row-start-1 flex items-baseline justify-end gap-2 sm:col-start-4">
          <time
            dateTime={when}
            title={formatDateTime(when, timezone)}
            className="whitespace-nowrap font-mono text-xs text-slate-500"
          >
            {age(when)}
          </time>
          <ChevronRight className="size-4 self-center text-slate-400" aria-hidden="true" />
        </p>
      </Link>
    </article>
  );
}
