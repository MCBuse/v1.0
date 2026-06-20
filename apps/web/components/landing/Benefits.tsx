import { BrainCircuit, FileCheck2, Handshake, QrCode } from "lucide-react";
import { ProductStackVisual } from "./DashboardMock";
import { Section } from "./Section";

const modules = [
  {
    icon: QrCode,
    title: "Payment Capture",
    body: "QR/NFC-enabled payment event capture for low-ticket transactions and merchant activity.",
  },
  {
    icon: FileCheck2,
    title: "Activity Records",
    body: "Structured transaction history built from daily payments, P2P activity, and merchant events.",
  },
  {
    icon: BrainCircuit,
    title: "Data Intelligence",
    body: "Behavioral signals, repayment patterns, payout visibility, and financial activity profiles.",
  },
  {
    icon: Handshake,
    title: "Partner Matching",
    body: "Connecting users and merchants with banks, fintechs, MFIs, and financial service providers.",
  },
];

export function ProductStack() {
  return (
    <Section
      id="product"
      tone="surface"
      eyebrow="Product stack"
      title="One Infrastructure, Multiple Use Cases"
      intro="The MCBuse product stack starts with transaction capture, turns events into data intelligence, and creates a path toward partner-enabled financial access."
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          {modules.map((module) => (
            <article
              key={module.title}
              className="rounded-lg border border-border bg-bg p-5"
            >
              <module.icon aria-hidden className="text-accent" size={25} />
              <h3 className="mt-4 text-lg font-semibold text-text">
                {module.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted">{module.body}</p>
            </article>
          ))}
        </div>

        <ProductStackVisual />
      </div>
    </Section>
  );
}
