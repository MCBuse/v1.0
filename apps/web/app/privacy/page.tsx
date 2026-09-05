import type { Metadata } from "next";

import { LegalStub } from "../../components/site/LegalStub";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How MCBuse handles personal and business data.",
  robots: { index: false },
};

export default function PrivacyPage() {
  return (
    <LegalStub
      eyebrow="Legal"
      title="Privacy Policy"
      intro="How MCBuse collects, uses and protects personal and business data."
      note="Our full privacy policy is being prepared alongside the pilot's data-governance workflows and is not yet published. In the meantime: nothing about a merchant's business is shared with a bank, fintech or lender without that merchant's explicit authorization, and consent can be withdrawn at any time. If you need specifics before the policy is published, contact us and we will answer directly."
    />
  );
}
