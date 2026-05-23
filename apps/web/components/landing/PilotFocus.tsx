import { PILOT_FORM_URL } from "./constants";
import { Section } from "./Section";

const archetypes = [
  "Cafés",
  "Bakeries",
  "Kiosks",
  "Market stalls",
  "Take-away counters",
];

const criteria = [
  "Frequent low-ticket transactions (under €30 average)",
  "Based in Munich or Berlin",
  "Open to running a 4–6 week pilot with us",
  "Happy to share weekly feedback as we improve",
];

export function PilotFocus() {
  return (
    <Section id="pilot">
      <div className="overflow-hidden rounded-[20px] border border-border bg-surface">
        <div className="grid gap-10 p-8 md:grid-cols-[1.2fr_1fr] md:gap-12 md:p-12">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-accent">
              Pilot focus
            </p>
            <h2 className="text-3xl font-semibold leading-[1.1] tracking-tight text-text sm:text-4xl">
              Built first for small merchants in Munich and Berlin.
            </h2>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-muted">
              We&apos;re piloting with a small group of shops with lots of little
              transactions. If that sounds like you, we&apos;d love to talk.
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              {archetypes.map((a) => (
                <span
                  key={a}
                  className="rounded-full border border-border bg-bg px-3 py-1 text-[13px] text-muted"
                >
                  {a}
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={PILOT_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-medium text-bg transition-colors hover:bg-accent-hover"
              >
                Join the pilot
              </a>
              <span className="text-xs text-subtle">
                Takes about 2 minutes. No commitment.
              </span>
            </div>
          </div>

          <div className="rounded-[14px] border border-border bg-bg p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
              Good fit if you
            </p>
            <ul className="mt-4 space-y-3">
              {criteria.map((c) => (
                <li key={c} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-[7px] inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  />
                  <span className="text-[14.5px] leading-relaxed text-text">
                    {c}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}
