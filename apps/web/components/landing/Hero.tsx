import { PILOT_FORM_URL } from "./constants";
import { DashboardCard, MockRow, MetricBlock } from "./DashboardMock";

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden px-6 pb-24 pt-16 sm:px-10 md:pb-32 md:pt-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-[640px] w-[640px] -translate-y-1/4 translate-x-1/4 rounded-full bg-accent/5 blur-3xl"
      />
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="grid items-center gap-14 md:grid-cols-[1.1fr_1fr] md:gap-12">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              Pilot live — Munich &amp; Berlin
            </span>

            <h1 className="mt-5 text-[42px] font-semibold leading-[1.04] tracking-[-0.04em] text-text sm:text-5xl md:text-[58px]">
              Payment reconciliation
              <br />
              infrastructure for
              <br />
              <span className="text-accent">small merchants.</span>
            </h1>

            <p className="mt-6 max-w-[460px] text-[17px] leading-relaxed text-muted">
              MCBuse connects QR and NFC payments to expected payouts —
              matching every transaction automatically and surfacing exceptions
              the moment they happen.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={PILOT_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-bg transition-colors hover:bg-accent-hover"
              >
                Join the pilot
              </a>
              <a
                href="#how-it-works"
                className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border px-6 text-sm font-medium text-muted transition-colors hover:border-border-strong hover:text-text"
              >
                See how it works
                <span aria-hidden>→</span>
              </a>
            </div>

            <div className="mt-8 flex items-center gap-5 border-t border-border pt-6">
              <HeroStat value="23" label="transactions today" />
              <div className="h-8 w-px bg-border" aria-hidden />
              <HeroStat value="€847" label="expected payout" />
              <div className="h-8 w-px bg-border" aria-hidden />
              <HeroStat value="<2s" label="match latency" />
            </div>
          </div>

          <HeroMock />
        </div>
      </div>
    </section>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-lg font-semibold tabular-nums text-text">
        {value}
      </span>
      <span className="text-[12px] text-subtle">{label}</span>
    </div>
  );
}

function HeroMock() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-4 -z-10 rounded-[28px] border border-accent/20 bg-accent/5"
      />
      <DashboardCard label="Today · Tue 23 May" meta="LIVE">
        <div className="grid grid-cols-2 divide-x divide-border/70 border-b border-border/70">
          <MetricBlock
            label="Payments captured"
            value="23"
            hint="QR · 18  ·  NFC · 5"
          />
          <MetricBlock
            label="Expected payout"
            value="€847.20"
            hint="Settles Wed 24 May"
          />
        </div>
        <div>
          <MockRow
            time="14:32"
            title="QR · table 4"
            amount="€18.40"
            status="Matched"
            tone="success"
          />
          <MockRow
            time="14:18"
            title="NFC · counter"
            amount="€6.20"
            status="Matched"
            tone="success"
          />
          <MockRow
            time="13:55"
            title="QR · table 2"
            amount="€42.00"
            status="Payout delayed"
            tone="warning"
          />
          <MockRow
            time="13:41"
            title="NFC · counter"
            amount="€3.80"
            status="Matched"
            tone="success"
          />
        </div>
        <div className="flex items-center justify-between border-t border-border/70 bg-warning-soft px-5 py-3">
          <span className="text-[12px] font-medium text-warning">
            1 exception flagged
          </span>
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-warning">
            Review
          </span>
        </div>
      </DashboardCard>
    </div>
  );
}
