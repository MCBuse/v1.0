import { CaptureFlowVisual } from "./DashboardMock";
import { Section } from "./Section";

const stages = [
  {
    title: "Capture",
    body: "QR/NFC payments, P2P activity, merchant transactions, and financial events.",
  },
  {
    title: "Structure",
    body: "Convert raw events into clean records with amount, timestamp, status, merchant or user ID, and activity type.",
  },
  {
    title: "Verify",
    body: "Use blockchain-backed infrastructure and partner-enabled workflows to support data integrity and traceability.",
  },
  {
    title: "Activate",
    body: "Turn activity records into merchant insights, credit signals, partner matching, and access opportunities.",
  },
];

export function Solution() {
  return (
    <Section
      id="solution"
      tone="soft"
      eyebrow="The solution"
      title="A Micro-Banking Infrastructure for Everyday Financial Activity"
      intro="MCBuse captures micro-financial activity and turns it into structured records that people, merchants, and financial institutions can use."
    >
      <CaptureFlowVisual />

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stages.map((stage) => (
          <article
            key={stage.title}
            className="rounded-lg border border-border bg-surface p-5"
          >
            <h3 className="text-base font-semibold text-text">{stage.title}</h3>
            <p className="mt-3 text-sm leading-6 text-muted">{stage.body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}
