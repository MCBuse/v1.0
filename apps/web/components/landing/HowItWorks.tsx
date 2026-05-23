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
      <ol className="relative grid gap-px bg-border md:grid-cols-5">
        {steps.map((s) => (
          <li key={s.n} className="bg-bg p-6 transition-colors hover:bg-surface">
            <span className="font-mono text-[28px] font-semibold tabular-nums leading-none text-border-strong">
              {s.n}
            </span>
            <h3 className="mt-4 text-[15px] font-semibold text-text">
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
