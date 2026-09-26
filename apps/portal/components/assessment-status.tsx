import {
  CheckCircle2,
  CircleDashed,
  Clock,
  PencilLine,
  type LucideIcon,
} from "lucide-react";
import { missingInputKind } from "@repo/shared";
import { cn } from "@/lib/utils";

/**
 * One colour per meaning, used the same way on the saved assessment and in
 * the Run credit assessment drawer, so a merchant learns it once:
 * green = you have it, amber = you can add it, blue = it builds up as you
 * record sales, grey = MCBuse can't measure it yet (nothing to do).
 */
export type InputStatus = "available" | "declare" | "sales" | "system";

export const STATUS: Record<
  InputStatus,
  {
    label: string;
    Icon: LucideIcon;
    text: string;
    soft: string;
    border: string;
    bar: string;
  }
> = {
  available: {
    label: "Available",
    Icon: CheckCircle2,
    text: "text-emerald-700",
    soft: "bg-emerald-50",
    border: "border-emerald-200",
    bar: "bg-emerald-500",
  },
  declare: {
    label: "You can add",
    Icon: PencilLine,
    text: "text-amber-700",
    soft: "bg-amber-50",
    border: "border-amber-200",
    bar: "bg-amber-400",
  },
  sales: {
    label: "Builds up with sales",
    Icon: Clock,
    text: "text-blue-700",
    soft: "bg-blue-50",
    border: "border-blue-200",
    bar: "bg-blue-400",
  },
  system: {
    label: "Not measured yet",
    Icon: CircleDashed,
    text: "text-slate-500",
    soft: "bg-slate-50",
    border: "border-slate-200",
    bar: "bg-slate-300",
  },
};

export const STATUS_ORDER: InputStatus[] = [
  "available",
  "declare",
  "sales",
  "system",
];

/** Why an input is missing decides what (if anything) the merchant can do. */
export function missingStatus(reason: string | null | undefined): Exclude<InputStatus, "available"> {
  return missingInputKind(reason);
}

export function StatusIcon({
  status,
  className,
}: {
  status: InputStatus;
  className?: string;
}) {
  const { Icon, text } = STATUS[status];
  return (
    <Icon
      aria-hidden="true"
      className={cn("size-5 shrink-0", text, className)}
    />
  );
}

/** A segmented bar plus legend: how much is there, and what kind of gap remains. */
export function AvailabilityBar({
  counts,
  label,
  noun = "available",
}: {
  counts: Partial<Record<InputStatus, number>>;
  label: string;
  /** Word after "x of y", e.g. "available" or "added". */
  noun?: string;
}) {
  const total = STATUS_ORDER.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  if (!total) return null;
  const available = counts.available ?? 0;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-base font-semibold text-slate-950">
          <span className="font-mono tabular-nums">{available}</span> of{" "}
          <span className="font-mono tabular-nums">{total}</span> {noun}
        </p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={STATUS_ORDER.filter((s) => counts[s])
          .map((s) => `${counts[s]} ${STATUS[s].label.toLowerCase()}`)
          .join(", ")}
      >
        {STATUS_ORDER.map((s) =>
          counts[s] ? (
            <div
              key={s}
              className={STATUS[s].bar}
              style={{ width: `${((counts[s] ?? 0) / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <StatusIcon status={s} className="size-4" />
            <span className="text-slate-700">{STATUS[s].label}</span>
            <span className="font-mono tabular-nums text-slate-950">
              {counts[s]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
