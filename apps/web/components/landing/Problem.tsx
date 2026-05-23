import { Section } from "./Section";

const problems = [
  {
    label: "Fragmented records",
    body: "Receipts, bank lines, and notes never line up. Reconciling at the end of the day takes hours, not minutes.",
  },
  {
    label: "Unclear payouts",
    body: "When will the money land? Which payments are in it? Most small merchants can't answer either question on demand.",
  },
  {
    label: "Missed exceptions",
    body: "A delayed payout or a failed capture is easy to miss in a busy shift — until it shows up as a gap a week later.",
  },
];

export function Problem() {
  return (
    <Section
      id="problem"
      eyebrow="The problem"
      title="Small payments happen fast. Records, payouts, and issues fall behind."
    >
      <div className="grid gap-px bg-border md:grid-cols-3">
        {problems.map((p) => (
          <div
            key={p.label}
            className="group bg-bg px-8 py-8 transition-colors hover:bg-surface"
          >
            <div className="mb-4 h-px w-8 bg-accent transition-all group-hover:w-12" />
            <h3 className="text-[15px] font-semibold text-text">{p.label}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              {p.body}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}
