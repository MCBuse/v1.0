import type { ReactNode } from "react";

type Step = { readonly n: string; readonly title: string; readonly body: string };

/** Numbered vertical timeline — the 7-step product flow. */
export function Timeline({ steps }: { steps: readonly Step[] }) {
  return (
    <ol className="relative border-l border-border pl-8">
      {steps.map((step) => (
        <li key={step.n} className="relative pb-10 last:pb-0">
          <span aria-hidden className="absolute -left-[2.15rem] top-1.5 h-2 w-2 bg-accent" />
          <span className="tabular font-mono text-[11px] uppercase tracking-[0.1em] text-subtle">
            {step.n}
          </span>
          <h3 className="mt-1 text-lg font-semibold tracking-[-0.015em] text-text">{step.title}</h3>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

type Phase = {
  readonly n: string;
  readonly status: "Now" | "Next" | "Later";
  readonly title: string;
  readonly points: readonly string[];
};

const NODE: Record<Phase["status"], string> = {
  Now: "bg-accent border-accent",
  Next: "bg-bg border-warning",
  Later: "bg-bg border-border-strong",
};

const CHIP: Record<Phase["status"], string> = {
  Now: "border-accent bg-accent text-on-accent",
  Next: "border-warning/40 bg-warning-soft text-warning",
  Later: "border-border-strong bg-transparent text-subtle",
};

/** Phase timeline with the current position marked. */
export function PhaseTimeline({ phases }: { phases: readonly Phase[] }) {
  return (
    <ol className="relative pl-8">
      <span aria-hidden className="absolute bottom-0 left-0 top-0 w-px bg-border-strong" />
      {phases.map((phase) => (
        <li key={phase.n} className="relative pb-12 last:pb-0">
          <span
            aria-hidden
            className={`absolute -left-[calc(2rem+5px)] top-1 h-2.5 w-2.5 border-2 ${NODE[phase.status]}`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center border px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] ${CHIP[phase.status]}`}
            >
              {phase.status}
            </span>
            <span className="tabular font-mono text-[11px] text-subtle">Phase {phase.n}</span>
          </div>
          <h3 className="mt-3 text-xl font-semibold tracking-[-0.015em] text-text">{phase.title}</h3>
          <ul className="mt-3 space-y-2">
            {phase.points.map((point) => (
              <li key={point} className="flex gap-3 text-base leading-relaxed text-muted">
                <span aria-hidden className="mt-2.5 h-px w-3 shrink-0 bg-border-strong" />
                <span className="max-w-2xl">{point}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** Two-column list band — accountability and boundary splits. */
export function SplitList({
  left,
  right,
}: {
  left: { label: string; items: readonly string[]; icon: ReactNode };
  right: { label: string; items: readonly string[]; icon: ReactNode };
}) {
  return (
    <div className="grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-0">
      {[left, right].map((col, i) => (
        <div key={col.label} className={i === 0 ? "md:border-r md:border-border md:pr-12" : "md:pl-12"}>
          <p className="mb-6 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">
            {col.label}
          </p>
          <ul className="space-y-4">
            {col.items.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span aria-hidden className="mt-1 shrink-0">
                  {col.icon}
                </span>
                <span className="text-base leading-relaxed text-text">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
