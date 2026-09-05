import { BOUNDARY } from "./content";
import { StatusChip } from "./primitives";

/** Hourly sales shape, 08:00–20:00. Fixed values — a mockup, not live data. */
const HOURS = [12, 22, 41, 68, 84, 57, 44, 39, 52, 71, 63, 34, 18];

const STATS = [
  { label: "Today's sales", value: "412.80", unit: "EUR" },
  { label: "Transactions", value: "137", unit: "" },
  { label: "Avg ticket", value: "3.01", unit: "EUR" },
];

/** Row data carried over from the previous mockup. */
const ROWS = [
  { title: "QR payment", meta: "Bakery · Berlin", amount: "8.40", tone: "success" as const, status: "Captured" },
  { title: "NFC tap", meta: "Café · Munich", amount: "4.80", tone: "success" as const, status: "Captured" },
  { title: "Payout review", meta: "Kiosk · Berlin", amount: "42.00", tone: "warning" as const, status: "Pending" },
];

export function DashboardPanel() {
  const peak = Math.max(...HOURS);

  return (
    <figure className="m-0 w-full">
      <div className="border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
            Merchant activity
          </span>
          <StatusChip tone="neutral">Sample data</StatusChip>
        </div>

        <div className="grid grid-cols-3 border-b border-border">
          {STATS.map((s, i) => (
            <div key={s.label} className={`px-6 py-5 ${i < 2 ? "border-r border-border" : ""}`}>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-subtle">{s.label}</p>
              <p className="tabular mt-2 font-mono text-xl font-medium text-text">
                {s.value}
                {s.unit && <span className="ml-1 text-[11px] text-subtle">{s.unit}</span>}
              </p>
            </div>
          ))}
        </div>

        <div className="border-b border-border px-6 py-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-subtle">
            Hourly rhythm
          </p>
          <div aria-hidden className="mt-4 flex h-24 items-end gap-1.5">
            {HOURS.map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-accent/70"
                style={{ height: `${Math.round((h / peak) * 100)}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-subtle">
            <span>08:00</span>
            <span>20:00</span>
          </div>
        </div>

        <ul>
          {ROWS.map((r) => (
            <li
              key={r.title}
              className="flex items-center justify-between gap-4 border-b border-border px-6 py-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{r.title}</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-subtle">{r.meta}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="tabular font-mono text-sm text-text">{r.amount}</span>
                <StatusChip tone={r.tone}>{r.status}</StatusChip>
              </div>
            </li>
          ))}
        </ul>

        <div className="px-6 py-5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-subtle">
              Credit-readiness
            </p>
            <span className="font-mono text-[11px] text-muted">Building history</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={60}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Credit-readiness progress"
            className="mt-3 h-1.5 w-full bg-border-strong"
          >
            <div className="h-full bg-success" style={{ width: "60%" }} />
          </div>
        </div>
      </div>

      <figcaption className="mt-3 font-mono text-[11px] text-subtle">{BOUNDARY.b9}</figcaption>
    </figure>
  );
}
