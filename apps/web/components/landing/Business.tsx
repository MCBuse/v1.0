import {
  BarChart3,
  FileText,
  HandCoins,
  Landmark,
  Network,
  ShieldCheck,
} from "lucide-react";
import { VerificationVisual } from "./DashboardMock";
import { Section } from "./Section";

const revenueStreams = [
  "B2B licensing for banks, MFIs, fintechs, and partners",
  "Transaction fees on micro and P2P transaction flows where enabled",
  "Activity signal API subscriptions",
  "Aggregated data insights for partners",
  "Future cross-border remittance and lending services",
];

const validationItems = [
  "Colosseum Frontier Hackathon sandbox demo",
  "Solana and blockchain ecosystem direction",
  "Demo and sandbox validation",
  "EXIST preparation",
  "Partner and pilot discussions",
  "Digital payment and stablecoin market context",
];

export function WhyBlockchain() {
  return (
    <Section
      id="blockchain"
      tone="soft"
      eyebrow="Why blockchain"
      title="Simple on the front end. Verifiable behind the scenes."
      intro="MCBuse uses blockchain infrastructure to support traceability, transaction metadata capture, and data integrity while keeping the user experience familiar for merchants and customers."
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            {
              icon: ShieldCheck,
              title: "Data integrity",
              body: "Support stronger confidence in activity records and event history.",
            },
            {
              icon: Network,
              title: "Traceability",
              body: "Connect transaction metadata to a verifiable infrastructure layer.",
            },
            {
              icon: FileText,
              title: "Structured records",
              body: "Create cleaner financial histories from everyday activity.",
            },
            {
              icon: Landmark,
              title: "Partner workflows",
              body: "Let regulated partners handle payment operations where required.",
            },
          ].map((item) => (
            <article
              key={item.title}
              className="rounded-lg border border-border bg-surface p-5"
            >
              <item.icon aria-hidden className="text-accent" size={24} />
              <h3 className="mt-4 text-base font-semibold text-text">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
            </article>
          ))}
        </div>

        <VerificationVisual />
      </div>
    </Section>
  );
}

export function BusinessModel() {
  return (
    <Section
      id="business"
      tone="surface"
      eyebrow="Business model"
      title="Business & Revenue Model"
      intro="The commercial direction is partner-enabled infrastructure, starting with pilot learning and expanding toward data, payment, and access services with the right regulated partners."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {revenueStreams.map((stream, index) => (
          <article
            key={stream}
            className="rounded-lg border border-border bg-bg p-5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
              {index === 0 ? (
                <Landmark aria-hidden size={20} />
              ) : index === 1 ? (
                <HandCoins aria-hidden size={20} />
              ) : index === 2 ? (
                <Network aria-hidden size={20} />
              ) : (
                <BarChart3 aria-hidden size={20} />
              )}
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">{stream}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

export function EcosystemValidation() {
  return (
    <Section
      id="validation"
      eyebrow="Ecosystem & validation"
      title="Built for Demo Feedback, Pilot Learning, and Partner Conversations"
      intro="The current website should support hackathon reviewers, grant and accelerator evaluators, merchants, partners, and investors without implying production maturity."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {validationItems.map((item) => (
          <div
            key={item}
            className="rounded-lg border border-border bg-surface p-5"
          >
            <p className="text-sm font-semibold text-text">{item}</p>
          </div>
        ))}
      </div>
      <p className="mt-5 rounded-lg border border-border bg-accent-soft p-5 text-sm leading-6 text-muted">
        Third-party logos should only be added after permission is confirmed.
        This MVP uses text-only ecosystem references to avoid unsupported logo
        usage.
      </p>
    </Section>
  );
}
