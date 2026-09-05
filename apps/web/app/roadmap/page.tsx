import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";

import { CtaStrip } from "../../components/site/CtaStrip";
import {
  BUSINESS_MODEL,
  BUSINESS_MODEL_NOTE,
  PHASES,
  VISION,
  VISION_CAVEAT,
} from "../../components/site/content";
import {
  Card,
  MonoEyebrow,
  Section,
  secondaryButtonClass,
  tertiaryLinkClass,
} from "../../components/site/primitives";
import { PhaseTimeline } from "../../components/site/Timeline";
import { EXTERNAL_LINKS, linkOrRequestAccess, outboundProps } from "../../components/landing/constants";

export const metadata: Metadata = {
  title: "Roadmap",
  description:
    "Four phases from MVP foundation to partner-facing profile access, plus how the business model works.",
};

export default function RoadmapPage() {
  const deckHref = linkOrRequestAccess(EXTERNAL_LINKS.pitchDeck, "MCBuse pitch deck request");

  return (
    <>
      <Section className="pb-8">
        <div className="max-w-3xl">
          <MonoEyebrow className="mb-5">Roadmap</MonoEyebrow>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-text sm:text-5xl">
            What we&rsquo;re building, in order
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted">
            Four phases from MVP foundation to partner-facing access. Timelines are indicative and
            will move with pilot results and partner discussions.
          </p>
        </div>
      </Section>

      <Section id="phases">
        <PhaseTimeline phases={PHASES} />
        <div className="mt-14 flex flex-col gap-4 sm:flex-row sm:items-center">
          <a href={deckHref} {...outboundProps(deckHref)} className={secondaryButtonClass}>
            Download the pitch deck
          </a>
          <Link href="/contact#waitlist-form" className={tertiaryLinkClass}>
            Follow the build →
          </Link>
        </div>
      </Section>

      <Section id="business-model" tone="ink" fullBleed>
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <h2 className="mb-14 text-3xl font-semibold leading-tight tracking-[-0.02em] text-text sm:text-4xl">
            How the business works
          </h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {BUSINESS_MODEL.map((b) => (
              <Card key={b.title} className="p-8">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
                  {b.label}
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-[-0.015em] text-text">
                  {b.title}
                </h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{b.body}</p>
              </Card>
            ))}
          </div>
          <p className="mt-8 flex items-start gap-2.5 text-[13px] leading-relaxed text-subtle">
            <Lock aria-hidden size={14} className="mt-0.5 shrink-0" />
            <span>{BUSINESS_MODEL_NOTE}</span>
          </p>
        </div>
      </Section>

      <Section id="vision" bordered>
        <div className="mx-auto max-w-4xl py-8 text-center">
          <MonoEyebrow className="mb-8 justify-center">Where this goes</MonoEyebrow>
          <p className="text-2xl font-semibold leading-snug tracking-[-0.02em] text-text sm:text-3xl">
            {VISION}
          </p>
          <p className="mt-8 text-sm leading-relaxed text-subtle">{VISION_CAVEAT}</p>
        </div>
      </Section>

      <CtaStrip
        title="Follow the build"
        body="We send occasional updates on pilot progress, partner conversations and what shipped."
        primary={{ label: "Join the waitlist", href: "/contact#waitlist-form" }}
        secondary={{ label: "Schedule a partner call", href: "/contact#partner-form" }}
      />
    </>
  );
}
