import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Handshake,
  Store,
} from "lucide-react";
import {
  EXTERNAL_LINKS,
  hasConfiguredUrl,
  linkOrRequestAccess,
  outboundProps,
} from "./constants";
import { MarketMapVisual, PartnerPipelineVisual } from "./DashboardMock";
import { primaryButtonClass, secondaryButtonClass, Section } from "./Section";

const merchantBenefits = [
  "QR/NFC payment acceptance",
  "Low-ticket transaction capture",
  "Daily sales visibility",
  "Payout status and reconciliation support",
  "Transaction history",
  "Business activity records",
  "Future credit readiness",
];

const partnerBenefits = [
  "Structured low-ticket activity data",
  "Merchant activity signals",
  "Financial identity infrastructure",
  "Credit-readiness signals",
  "Payment and settlement partner workflows",
  "Pilot collaboration opportunities",
  "Future API-based data access",
];

export function AudienceSections() {
  const partnerHref = linkOrRequestAccess(
    EXTERNAL_LINKS.partnerCall,
    "Request MCBuse partner call",
  );

  return (
    <>
      <Section
        id="merchants"
        tone="soft"
        eyebrow="For micro-merchants"
        title="Accept payments. Understand activity. Build visibility."
        intro="MCBuse helps micro-merchants capture low-ticket payments and transform them into simple activity records for daily sales, payout status, transaction history, and business rhythm."
      >
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-border bg-surface p-6">
            <Store aria-hidden className="text-accent" size={28} />
            <h3 className="mt-5 text-2xl font-semibold text-text">
              Designed for everyday shops
            </h3>
            <p className="mt-4 text-base leading-7 text-muted">
              Cafe counters, kiosks, bakeries, takeaway shops, food trucks,
              bars, and small retailers need simple payment capture and usable
              records without heavy operational overhead.
            </p>
            <a
              href={EXTERNAL_LINKS.pilot}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-6 ${primaryButtonClass}`}
            >
              Join the Merchant Pilot
              <ArrowRight aria-hidden size={16} />
            </a>
          </div>

          <BenefitGrid benefits={merchantBenefits} />
        </div>
      </Section>

      <Section
        id="partners"
        tone="surface"
        eyebrow="For partners"
        title="Structured activity data for underserved financial segments."
        intro="MCBuse is designed as a partner-enabled infrastructure layer. It does not replace regulated financial infrastructure; it captures and structures activity so partners can better understand merchants, users, and micro-financial behavior."
      >
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <BenefitGrid benefits={partnerBenefits} />
            <a
              href={partnerHref}
              className={`mt-6 ${secondaryButtonClass}`}
              {...outboundProps(partnerHref)}
            >
              <Handshake aria-hidden size={16} />
              {hasConfiguredUrl(EXTERNAL_LINKS.partnerCall)
                ? "Schedule a Partner Call"
                : "Request Partner Call"}
            </a>
          </div>

          <div>
            <PartnerPipelineVisual />
            <div className="mt-4 rounded-lg border border-border bg-bg p-5">
              <Building2 aria-hidden className="text-accent" size={24} />
              <p className="mt-3 text-sm leading-6 text-muted">
                Target collaborators include banks, fintechs, PSPs, MFIs,
                payment partners, compliance partners, and ecosystem programs.
              </p>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}

export function MarketEntry() {
  return (
    <Section
      id="market"
      eyebrow="Market entry"
      title="Starting with Micro-Merchants in Germany"
      intro="MCBuse's initial market focus is Germany, with a pilot direction around Berlin and Munich micro-SME merchants handling high-frequency, low-ticket baskets."
    >
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-border bg-surface p-6">
          <CalendarDays aria-hidden className="text-accent" size={28} />
          <h3 className="mt-5 text-2xl font-semibold text-text">
            Pilot preparation focus
          </h3>
          <p className="mt-4 text-base leading-7 text-muted">
            The target segment includes cafes, kiosks, bakeries, takeaway
            shops, food trucks, bars, and small retailers that process frequent
            low-ticket transactions.
          </p>
          <ul className="mt-5 space-y-3">
            {[
              "Berlin and Munich",
              "Micro-SME merchants",
              "QR/NFC payment capture",
              "Merchant visibility dashboard",
              "Payment-linked activity records",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-muted">
                <CheckCircle2
                  aria-hidden
                  className="mt-0.5 shrink-0 text-success"
                  size={17}
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <MarketMapVisual />
      </div>
    </Section>
  );
}

function BenefitGrid({ benefits }: { benefits: string[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {benefits.map((benefit) => (
        <div
          key={benefit}
          className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4"
        >
          <CheckCircle2
            aria-hidden
            className="mt-0.5 shrink-0 text-success"
            size={18}
          />
          <span className="text-sm leading-6 text-muted">{benefit}</span>
        </div>
      ))}
    </div>
  );
}
