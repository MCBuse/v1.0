import { Section } from "./Section";

const steps = [
  {
    n: "01",
    title: "Onboard",
    body: "Tell us about your shop. We connect you with a licensed payment partner.",
  },
  {
    n: "02",
    title: "Capture",
    body: "Take QR or NFC payments at the counter, table, or stall.",
  },
  {
    n: "03",
    title: "Match",
    body: "Each payment is matched to its expected payout — automatically.",
  },
  {
    n: "04",
    title: "Flag",
    body: "Delayed, missing, or mismatched payouts surface as exceptions.",
  },
  {
    n: "05",
    title: "Insights",
    body: "See your daily totals, your busy hours, and your weekly rhythm.",
  },
];

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      eyebrow="How it works"
      title="Five quiet steps. One clear record."
    >
      <ol className="grid gap-3 md:grid-cols-5">
        {steps.map((s, i) => (
          <li
            key={s.n}
            className="relative rounded-[14px] border border-border bg-surface p-5"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[0.14em] text-accent">
                {s.n}
              </span>
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className="hidden text-border-strong md:inline"
                >
                  →
                </span>
              )}
            </div>
            <h3 className="mt-3 text-[15px] font-semibold text-text">
              {s.title}
            </h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
              {s.body}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
