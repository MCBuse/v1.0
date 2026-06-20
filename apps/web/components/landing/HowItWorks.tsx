import { ArrowRight } from "lucide-react";
import { IcebergVisual } from "./DashboardMock";
import { secondaryButtonClass, Section } from "./Section";

export function WhyStarted() {
  return (
    <Section
      id="why"
      tone="surface"
      eyebrow="Why MCBuse exists"
      title="Everyday financial activity is real. Too much of it stays invisible."
      intro="Billions of people and small businesses transact every day, but cash payments, informal lending, low-ticket purchases, delayed settlements, fragmented wallets, and repeated onboarding checks often leave no clean financial record."
    >
      <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-lg leading-8 text-muted">
            MCBuse was founded to make everyday financial activity visible,
            structured, and usable, starting with micro-transactions and
            merchant payment data.
          </p>
          <a href="#solution" className={`mt-7 ${secondaryButtonClass}`}>
            See How It Works
            <ArrowRight aria-hidden size={16} />
          </a>
        </div>

        <IcebergVisual />
      </div>
    </Section>
  );
}
