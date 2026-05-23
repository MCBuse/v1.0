import { PILOT_FORM_URL } from "./constants";
import { DashboardCard, MockRow, MetricBlock } from "./DashboardMock";

export function Hero() {
  return (
    <section id="top" className="px-6 pb-20 pt-12 sm:px-10 md:pb-28 md:pt-20">
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="grid items-center gap-14 md:grid-cols-[1.05fr_1fr] md:gap-12">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              Pilot live — Munich &amp; Berlin
            </span>
            <h1 className="mt-5 text-[40px] font-semibold leading-[1.05] tracking-tight text-text sm:text-5xl md:text-[56px]">
              Small payments.
              <br />
              Clear payouts.
              <br />
              <span className="text-accent">Better business records.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              MCBuse helps small merchants capture QR/NFC payments, track expected
              payouts, spot exceptions, and understand daily sales activity — from
              one simple dashboard.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={PILOT_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-medium text-bg transition-colors hover:bg-accent-hover"
              >
                Join the pilot
              </a>
              <a
                href="#how-it-works"
                className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-6 text-sm font-medium text-text transition-colors hover:border-border-strong"
              >
                See how it works
                <span aria-hidden>→</span>
              </a>
            </div>
            <p className="mt-6 text-xs text-subtle">
              Powered by licensed payment partners. No long-term contracts.
            </p>
          </div>

          <HeroMock />
        </div>
      </div>
    </section>
  );
}

function HeroMock() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-x-4 -bottom-6 -top-6 -z-10 rounded-[24px] bg-accent-soft/60 blur-2xl"
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
            tone="default"
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
        <div className="flex items-center justify-between border-t border-border/70 bg-warning-soft/50 px-5 py-3">
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
