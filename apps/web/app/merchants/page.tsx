import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

import { Accordion } from "../../components/site/Accordion";
import { CtaStrip } from "../../components/site/CtaStrip";
import { DashboardPanel } from "../../components/site/DashboardPanel";
import { MARKET_CHIPS, MERCHANT_BENEFITS, MERCHANT_FAQ } from "../../components/site/content";
import {
  MonoEyebrow,
  Section,
  primaryButtonClass,
  secondaryButtonClass,
} from "../../components/site/primitives";
import { EligibilityCheck } from "../../components/merchants/EligibilityCheck";

export const metadata: Metadata = {
  title: "For Micro-Merchants",
  description:
    "Accept payments, see your daily sales rhythm and payout status, and build a business record you can share with a lender. Pilot open in Berlin and Munich.",
};

export default function MerchantsPage() {
  return (
    <>
      <Section>
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div>
            <MonoEyebrow className="mb-5">For micro-merchants</MonoEyebrow>
            <h1 className="text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-text sm:text-5xl">
              Accept payments. Understand activity. Build financial visibility.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted">
              Built for kiosks, cafés, bakeries and food trucks. Daily sales tracking, payout
              clarity, and preparation for future financial services.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/contact#merchant-form"
                className={`${primaryButtonClass} w-full sm:w-auto`}
              >
                Join the Pilot
              </Link>
              <Link href="#eligibility" className={`${secondaryButtonClass} w-full sm:w-auto`}>
                Check your eligibility
              </Link>
            </div>
          </div>
          <DashboardPanel />
        </div>
      </Section>

      <Section bordered title="What you&rsquo;ll see">
        <ul className="grid grid-cols-1 border-t border-border sm:grid-cols-2">
          {MERCHANT_BENEFITS.map((b) => (
            <li
              key={b}
              className="flex items-start gap-3 border-b border-border py-4 pr-6 sm:even:pl-6 sm:odd:border-r sm:odd:border-border"
            >
              <Check aria-hidden size={18} className="mt-0.5 shrink-0 text-accent" />
              <span className="text-base text-text">{b}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="eligibility"
        tone="ink"
        fullBleed
      >
        <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
          <MonoEyebrow className="mb-4">Eligibility</MonoEyebrow>
          <h2 className="text-3xl font-semibold leading-tight tracking-[-0.02em] text-text sm:text-4xl">
            Is the pilot a fit for your business?
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">
            Three questions. Nothing is stored unless you choose to apply.
          </p>
          <div className="mt-10">
            <EligibilityCheck />
          </div>
        </div>
      </Section>

      <Section>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="text-3xl font-semibold leading-tight tracking-[-0.02em] text-text sm:text-4xl">
              Starting with Berlin and Munich
            </h2>
          </div>
          <div className="lg:col-span-7">
            <p className="text-base leading-relaxed text-muted sm:text-lg">
              Our first pilot focuses on high-frequency, low-ticket businesses in two core urban
              ecosystems: cafés, kiosks, bakeries, takeaway shops, food trucks, bars and small
              retailers.
            </p>
            <ul className="mt-8 flex flex-wrap gap-2.5">
              {MARKET_CHIPS.map((chip) => (
                <li key={chip}>
                  <span className="inline-flex border border-border-strong px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                    {chip}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section id="faq" bordered title="Questions merchants ask">
        <div className="max-w-3xl">
          <Accordion items={MERCHANT_FAQ} />
        </div>
      </Section>

      <CtaStrip
        title="Join the merchant pilot"
        body="Tell us about your business and we will get back to you within two working days."
        primary={{ label: "Join the Pilot", href: "/contact#merchant-form" }}
        secondary={{ label: "See the sandbox", href: "/demo" }}
      />
    </>
  );
}
