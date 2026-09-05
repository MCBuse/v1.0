import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ContactForm } from "../../components/contact/ContactForm";
import { CONTACT_EMAIL, EXTERNAL_LINKS, linkOrRequestAccess, outboundProps } from "../../components/landing/constants";
import { MonoEyebrow, Section, tertiaryLinkClass } from "../../components/site/primitives";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Apply to the merchant pilot, request a partner discovery call, or join the waitlist.",
};

export default function ContactPage() {
  const deckHref = linkOrRequestAccess(EXTERNAL_LINKS.pitchDeck, "MCBuse pitch deck request");

  return (
    <>
      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <MonoEyebrow className="mb-5 justify-center">Contact</MonoEyebrow>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-text sm:text-5xl">
            Let&rsquo;s talk
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted">
            Choose what fits you and we will route it to the right person.
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-2xl">
          <ContactForm />
        </div>
      </Section>

      <Section tone="ink" fullBleed>
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <ul className="border-t border-border">
            <li className="flex flex-col gap-3 border-b border-border py-6 md:flex-row md:items-center md:justify-between md:gap-8">
              <h2 className="text-lg font-semibold tracking-[-0.015em] text-text md:w-1/4">
                Email us
              </h2>
              <p className="font-mono text-[15px] text-muted md:flex-1">{CONTACT_EMAIL}</p>
              <a href={EXTERNAL_LINKS.contact} className={tertiaryLinkClass}>
                Open email
                <ArrowRight aria-hidden size={16} />
              </a>
            </li>
            <li className="flex flex-col gap-3 border-b border-border py-6 md:flex-row md:items-center md:justify-between md:gap-8">
              <h2 className="text-lg font-semibold tracking-[-0.015em] text-text md:w-1/4">
                Try the sandbox
              </h2>
              <p className="text-[15px] text-muted md:flex-1">
                Simulated transaction feeds and dashboard alerts.
              </p>
              <Link href="/demo" className={tertiaryLinkClass}>
                Go to the sandbox
                <ArrowRight aria-hidden size={16} />
              </Link>
            </li>
            <li className="flex flex-col gap-3 border-b border-border py-6 md:flex-row md:items-center md:justify-between md:gap-8">
              <h2 className="text-lg font-semibold tracking-[-0.015em] text-text md:w-1/4">
                Read the deck
              </h2>
              <p className="text-[15px] text-muted md:flex-1">
                The current investor and partner overview.
              </p>
              <a href={deckHref} {...outboundProps(deckHref)} className={tertiaryLinkClass}>
                Download the pitch deck
                <ArrowRight aria-hidden size={16} />
              </a>
            </li>
          </ul>
        </div>
      </Section>
    </>
  );
}
