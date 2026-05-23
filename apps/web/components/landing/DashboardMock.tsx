import type { ReactNode } from "react";

type Tone = "default" | "success" | "warning" | "muted";

const toneClass: Record<Tone, string> = {
  default: "text-text",
  success: "text-success",
  warning: "text-warning",
  muted: "text-muted",
};

export function DashboardCard({
  children,
  className,
  label,
  meta,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
  meta?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[14px] border border-border bg-surface shadow-[0_1px_0_rgba(26,23,20,0.04),0_18px_40px_-22px_rgba(26,23,20,0.18)] ${className ?? ""}`}
    >
      {(label || meta) && (
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-3">
          {label && (
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
              {label}
            </span>
          )}
          {meta && (
            <span className="font-mono text-[11px] text-subtle">{meta}</span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export function MockRow({
  time,
  title,
  amount,
  status,
  tone = "default",
}: {
  time: string;
  title: string;
  amount: string;
  status?: string;
  tone?: Tone;
}) {
  const dotTone =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : "bg-border-strong";
  return (
    <div className="flex items-center justify-between border-b border-border/60 px-5 py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotTone}`} aria-hidden />
        <span className="font-mono text-[11px] text-subtle">{time}</span>
        <span className="truncate text-sm text-text">{title}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {status && (
          <span className={`text-[11px] font-medium ${toneClass[tone]}`}>
            {status}
          </span>
        )}
        <span className="font-mono text-sm tabular-nums text-text">{amount}</span>
      </div>
    </div>
  );
}

export function MetricBlock({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
        {label}
      </span>
      <span
        className={`font-mono text-2xl tabular-nums tracking-tight ${toneClass[tone]}`}
      >
        {value}
      </span>
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
    </div>
  );
}
