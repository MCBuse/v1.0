import {
  ArrowRight,
  Download,
  Mail,
  Play,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import {
  EXTERNAL_LINKS,
  hasConfiguredUrl,
  linkOrRequestAccess,
  outboundProps,
} from "./constants";
import { HeroProductVisual } from "./DashboardMock";
import {
  linkFocusClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "./Section";

export function Hero() {
  const demoHref = linkOrRequestAccess(
    EXTERNAL_LINKS.demoVideo,
    "Request MCBuse demo video access",
  );
  const deckHref = linkOrRequestAccess(
    EXTERNAL_LINKS.pitchDeck,
    "Request MCBuse pitch deck access",
  );
  const apkHref = linkOrRequestAccess(
    EXTERNAL_LINKS.apk,
    "Request MCBuse APK access",
  );

  return (
    <section id="top" className="bg-bg px-5 py-16 sm:px-8 lg:py-24">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-muted">
            <ShieldCheck aria-hidden className="text-accent" size={17} />
            Sandbox demo stage. MVP development underway.
          </div>

          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight text-text sm:text-5xl lg:text-6xl">
            Turning Micro-Payments into Financial Visibility
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            MCBuse is building a blockchain-powered micro-banking infrastructure
            that captures everyday transaction activity, from low-ticket
            merchant payments to peer-to-peer financial behavior, and transforms
            it into structured, usable financial data.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a href={demoHref} className={primaryButtonClass} {...outboundProps(demoHref)}>
              <Play aria-hidden size={16} />
              {hasConfiguredUrl(EXTERNAL_LINKS.demoVideo)
                ? "Watch Demo"
                : "Request Demo"}
            </a>
            <a
              href={EXTERNAL_LINKS.pilot}
              target="_blank"
              rel="noopener noreferrer"
              className={secondaryButtonClass}
            >
              Join the Pilot
              <ArrowRight aria-hidden size={16} />
            </a>
          </div>

          <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold text-muted">
            <a
              href={deckHref}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-2 transition-colors hover:text-accent ${linkFocusClass}`}
              {...outboundProps(deckHref)}
            >
              <Download aria-hidden size={16} />
              {hasConfiguredUrl(EXTERNAL_LINKS.pitchDeck)
                ? "Download Pitch Deck"
                : "Request Pitch Deck"}
            </a>
            <a
              href={apkHref}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-2 transition-colors hover:text-accent ${linkFocusClass}`}
              {...outboundProps(apkHref)}
            >
              <Smartphone aria-hidden size={16} />
              {hasConfiguredUrl(EXTERNAL_LINKS.apk) ? "Test APK" : "Request APK"}
            </a>
            <a
              href={EXTERNAL_LINKS.contact}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-2 transition-colors hover:text-accent ${linkFocusClass}`}
            >
              <Mail aria-hidden size={16} />
              Contact Us
            </a>
          </div>

          <dl className="mt-8 grid max-w-xl grid-cols-3 gap-3 border-t border-border pt-6">
            <HeroStat value="QR/NFC" label="payment capture" />
            <HeroStat value="P2P" label="activity events" />
            <HeroStat value="API" label="partner direction" />
          </dl>
        </div>

        <HeroProductVisual />
      </div>
    </section>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="font-mono text-lg font-semibold text-text">{value}</dt>
      <dd className="mt-1 text-xs text-muted">{label}</dd>
    </div>
  );
}
