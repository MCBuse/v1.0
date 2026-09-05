import type { Metadata } from "next";
import Link from "next/link";
import { Check, Lock } from "lucide-react";

import { Accordion } from "../../components/site/Accordion";
import { CtaStrip } from "../../components/site/CtaStrip";
import { DataFieldTable } from "../../components/site/DataFieldTable";
import { ACCOUNTABILITIES, GOVERNANCE, PARTNER_FAQ } from "../../components/site/content";
import {
  Card,
  MonoEyebrow,
  Section,
  primaryButtonClass,
  secondaryButtonClass,
} from "../../components/site/primitives";
import { SplitList } from "../../components/site/Timeline";

export const metadata: Metadata = {
  title: "For Banks, Fintechs and PSPs",
  description:
    "Structured merchant activity data and credit-readiness indicators for underserved low-ticket segments — supporting, not replacing, your underwriting.",
};

export default function PartnersPage() {
  return (
    <>
      <Section className="pb-8">
        <div className="max-w-3xl">
          <MonoEyebrow className="mb-5">For banks, fintechs and PSPs</MonoEyebrow>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-text sm:text-5xl">
            Structured merchant activity data for underserved low-ticket segments.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted">
            MCBuse is a software and data infrastructure layer. It provides structured merchant
            activity data and credit-readiness indicators that support — but do not replace — your
            institution&rsquo;s own underwriting process.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/contact#partner-form"
              className={`${primaryButtonClass} w-full sm:w-auto`}
            >
              Schedule a partner call
            </Link>
            <Link href="#data-fields" className={`${secondaryButtonClass} w-full sm:w-auto`}>
              Review the data fields
            </Link>
          </div>
        </div>
      </Section>

      <Section tone="ink" fullBleed>
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <h2 className="mb-14 text-3xl font-semibold leading-tight tracking-[-0.02em] text-text sm:text-4xl">
            Where the boundary sits
          </h2>
          <SplitList
            left={{
              label: "Infrastructure layer — MCBuse",
              items: ACCOUNTABILITIES.infrastructure,
              icon: <Check aria-hidden size={18} className="text-accent" />,
            }}
            right={{
              label: "Regulated layer — partner",
              items: ACCOUNTABILITIES.regulated,
              icon: <Lock aria-hidden size={18} className="text-subtle" />,
            }}
          />
        </div>
      </Section>

      <Section
        id="data-fields"
        title="What the profile contains"
        intro="Fields are classified under our internal data-classification framework. Only classification levels 1 and 2 are ever surfaced to a partner. Levels 3 to 5 remain internal-only."
      >
        <DataFieldTable />
        <p className="mt-5 flex max-w-3xl items-start gap-2.5 text-[13px] leading-relaxed text-subtle">
          <Lock aria-hidden size={14} className="mt-0.5 shrink-0" />
          <span>
            Individual merchant records are released only with that merchant&rsquo;s explicit
            authorization. MCBuse is a trusted data partner, not a data broker. Field names are
            illustrative of shape and may change before any integration.
          </span>
        </p>
      </Section>

      <Section id="governance" tone="ink" fullBleed>
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <h2 className="mb-14 text-3xl font-semibold leading-tight tracking-[-0.02em] text-text sm:text-4xl">
            How the data is governed
          </h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {GOVERNANCE.map((g) => (
              <Card key={g.n} className="p-8">
                <span aria-hidden className="tabular font-mono text-sm text-accent">
                  {g.n}
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-[-0.015em] text-text">
                  {g.title}
                </h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{g.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      <Section id="faq" bordered title="Questions partners ask">
        <div className="max-w-3xl">
          <Accordion items={PARTNER_FAQ} />
        </div>
      </Section>

      <CtaStrip
        title="Talk to us about a pilot"
        body="We are looking for partners who want to shape which fields are genuinely useful inside a real underwriting process."
        primary={{ label: "Schedule a partner call", href: "/contact#partner-form" }}
        secondary={{ label: "Request sandbox access", href: "/demo#access" }}
      />
    </>
  );
}
