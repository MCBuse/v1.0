import { ArrowRight, Download, Mail, Play } from "lucide-react";
import {
  EXTERNAL_LINKS,
  hasConfiguredUrl,
  linkOrRequestAccess,
  outboundProps,
} from "./constants";
import { navyButtonClass, secondaryButtonClass, Section } from "./Section";

export function FinalCta() {
  const demoHref = linkOrRequestAccess(
    EXTERNAL_LINKS.demoVideo,
    "Request MCBuse demo video access",
  );
  const deckHref = linkOrRequestAccess(
    EXTERNAL_LINKS.pitchDeck,
    "Request MCBuse pitch deck access",
  );

  return (
    <Section
      id="contact"
      tone="navy"
      centered
      eyebrow="Contact"
      title="Build the Future of Micro-Banking with Us"
      intro="We are looking for merchants, fintech partners, banks, ecosystem collaborators, and investors who want to help turn everyday financial activity into structured financial visibility."
    >
      <div className="flex flex-wrap justify-center gap-3">
        <a
          href={EXTERNAL_LINKS.pilot}
          target="_blank"
          rel="noopener noreferrer"
          className={navyButtonClass}
        >
          Join the Pilot
          <ArrowRight aria-hidden size={16} />
        </a>
        <a
          href={demoHref}
          className={secondaryButtonClass}
          {...outboundProps(demoHref)}
        >
          <Play aria-hidden size={16} />
          {hasConfiguredUrl(EXTERNAL_LINKS.demoVideo)
            ? "Watch Demo"
            : "Request Demo"}
        </a>
        <a
          href={deckHref}
          className={secondaryButtonClass}
          {...outboundProps(deckHref)}
        >
          <Download aria-hidden size={16} />
          {hasConfiguredUrl(EXTERNAL_LINKS.pitchDeck)
            ? "Download Pitch Deck"
            : "Request Pitch Deck"}
        </a>
        <a href={EXTERNAL_LINKS.contact} className={secondaryButtonClass}>
          <Mail aria-hidden size={16} />
          Contact Us
        </a>
      </div>
    </Section>
  );
}
