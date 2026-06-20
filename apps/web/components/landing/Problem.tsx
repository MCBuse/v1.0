import {
  Banknote,
  CircleDollarSign,
  EyeOff,
  Landmark,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { Section } from "./Section";

const problems = [
  {
    icon: EyeOff,
    title: "Invisible Transactions",
    body: "Everyday payments and informal activity often create no usable financial record.",
  },
  {
    icon: ReceiptText,
    title: "Merchant Friction",
    body: "Micro-merchants face fees, payout delays, reconciliation issues, and onboarding barriers.",
  },
  {
    icon: WalletCards,
    title: "Fragmented Financial Identity",
    body: "Users' financial behavior is scattered across cash, wallets, banks, and informal systems.",
  },
  {
    icon: Landmark,
    title: "Limited Banking Visibility",
    body: "Banks and financial partners struggle to assess users and small businesses without structured activity data.",
  },
  {
    icon: CircleDollarSign,
    title: "Low-Ticket Inefficiency",
    body: "Traditional banking and payment systems are not optimized for high-frequency, low-value transactions.",
  },
];

export function Problem() {
  return (
    <Section
      id="problem"
      eyebrow="The problem"
      title="Micro-Activity Is Real. The Data Is Missing."
      intro="People and small businesses already create useful financial signals every day. The issue is that those signals are fragmented, informal, or unavailable to the systems that need them."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {problems.map((problem) => (
          <article
            key={problem.title}
            className="rounded-lg border border-border bg-surface p-5"
          >
            <problem.icon aria-hidden className="text-accent" size={24} />
            <h3 className="mt-4 text-base font-semibold text-text">
              {problem.title}
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted">{problem.body}</p>
          </article>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-border bg-accent-soft p-5">
        <div className="flex items-start gap-4">
          <Banknote aria-hidden className="mt-1 shrink-0 text-accent" size={24} />
          <p className="text-base leading-7 text-muted">
            MCBuse focuses on the gap between daily economic activity and formal
            financial visibility. The product direction is data infrastructure,
            not a claim to replace regulated banking rails.
          </p>
        </div>
      </div>
    </Section>
  );
}
