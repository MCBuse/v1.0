import { Section } from "./Section";

export function Solution() {
  return (
    <Section
      id="solution"
      eyebrow="The solution"
      title="Every payment, a clean record."
      intro="MCBuse turns each QR or NFC payment into a structured activity record — linked to the expected payout, with exceptions surfaced as they happen."
    >
      <div className="grid items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
        <EventCard
          label="Payment event"
          rows={[
            ["channel", "QR · table 4"],
            ["amount", "€18.40"],
            ["time", "14:32"],
          ]}
        />

        <div className="flex justify-center" aria-hidden>
          <Arrow />
        </div>

        <EventCard
          label="Activity record"
          tone="accent"
          rows={[
            ["amount", "€18.40"],
            ["expected payout", "Wed 24 May"],
            ["status", "Matched"],
          ]}
        />
      </div>
    </Section>
  );
}

function EventCard({
  label,
  rows,
  tone = "default",
}: {
  label: string;
  rows: Array<[string, string]>;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={`rounded-[14px] border bg-surface p-6 ${
        tone === "accent" ? "border-accent/40" : "border-border"
      }`}
    >
      <p
        className={`text-[11px] font-medium uppercase tracking-[0.14em] ${
          tone === "accent" ? "text-accent" : "text-subtle"
        }`}
      >
        {label}
      </p>
      <dl className="mt-4 space-y-2.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4">
            <dt className="text-[13px] text-muted">{k}</dt>
            <dd className="font-mono text-[13px] tabular-nums text-text">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Arrow() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 44 44"
      fill="none"
      className="rotate-90 text-border-strong md:rotate-0"
    >
      <path
        d="M6 22h32M28 12l10 10-10 10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
