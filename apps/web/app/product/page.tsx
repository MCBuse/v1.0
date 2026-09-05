import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";

import { CtaStrip } from "../../components/site/CtaStrip";
import { MODULES, PRODUCT_STEPS, VERIFIABLE_CHIPS } from "../../components/site/content";
import {
  Card,
  MonoEyebrow,
  Section,
  StatusChip,
  primaryButtonClass,
} from "../../components/site/primitives";
import { Timeline } from "../../components/site/Timeline";

export const metadata: Metadata = {
  title: "Product & Systems",
  description:
    "Four modules that turn QR, NFC and stablecoin payment events into structured merchant records, business analytics and credit-readiness indicators.",
};

export default function ProductPage() {
  return (
    <>
      <Section className="pb-8">
        <div className="max-w-3xl">
          <MonoEyebrow className="mb-5">Product &amp; Systems</MonoEyebrow>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-text sm:text-5xl">
            The MCBuse data architecture
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted">
            Four software modules designed to bridge high-frequency micro-transactions and the
            formal financial system — structured capture, merchant analytics, readiness indicators,
            and preparation for institutional review.
          </p>
          <Link href="/demo#access" className={`${primaryButtonClass} mt-10`}>
            Request sandbox access
          </Link>
        </div>
      </Section>

      <Section>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {MODULES.map((m) => (
            <Card key={m.id} className="flex flex-col p-8" as="article">
              <span id={m.id} className="scroll-mt-24" />
              <span aria-hidden className="tabular font-mono text-sm text-accent">
                {m.n}
              </span>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-semibold tracking-[-0.015em] text-text">{m.title}</h2>
                {"warn" in m && m.warn && <StatusChip tone="warning">{m.warn}</StatusChip>}
              </div>
              <p className="mt-3 text-base leading-relaxed text-muted">{m.body}</p>

              <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.1em] text-subtle">
                Focus
              </p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-text">{m.focus}</p>

              <p className="mt-auto flex items-start gap-2.5 border-t border-border pt-5 text-[13px] leading-relaxed text-subtle">
                <Lock aria-hidden size={14} className="mt-0.5 shrink-0" />
                <span>{m.boundary}</span>
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Section tone="ink" fullBleed>
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="text-3xl font-semibold leading-tight tracking-[-0.02em] text-text sm:text-4xl">
                Simple on the front end. Verifiable underneath.
              </h2>
            </div>
            <div className="lg:col-span-7">
              <p className="text-base leading-relaxed text-muted sm:text-lg">
                Merchants and customers use a familiar payment flow. Underneath, MCBuse records each
                payment event so the resulting history is provider-neutral and independently
                checkable. Stablecoin payments are the initial capture surface because they produce
                a clean, first-party record of a sale at the moment it happens.
              </p>
              <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">
                A merchant can therefore share a profile a lender is able to verify, rather than a
                screenshot a lender has to trust.
              </p>
              <ul className="mt-8 flex flex-wrap gap-2.5">
                {VERIFIABLE_CHIPS.map((chip) => (
                  <li key={chip}>
                    <span className="inline-flex border border-border-strong px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                      {chip}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="how-it-works"
        title="Seven steps from a sale to a lender-ready profile"
        bordered
      >
        <Timeline steps={PRODUCT_STEPS} />
      </Section>

      <CtaStrip
        title="See it running on simulated data"
        body="The sandbox pushes synthetic payment events through the capture layer so you can watch the dashboards and readiness indicators respond."
        primary={{ label: "View the sandbox demo", href: "/demo" }}
        secondary={{ label: "Schedule a partner call", href: "/contact#partner-form" }}
      />
    </>
  );
}
