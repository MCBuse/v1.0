import type { Metadata } from "next";

import { LegalStub } from "../../components/site/LegalStub";

export const metadata: Metadata = {
  title: "Impressum",
  description: "Legal notice for MCBuse.",
  robots: { index: false },
};

export default function ImpressumPage() {
  return (
    <LegalStub
      eyebrow="Legal"
      title="Impressum"
      intro="Legal notice under German law."
      note="MCBuse is in MVP and pilot preparation and is not yet incorporated, so there is no registered entity, register number or VAT ID to publish. This page will carry the full legal notice — entity name, legal form, registered address, register number, VAT ID and a responsible contact — as soon as incorporation completes. Until then, please contact us directly."
    />
  );
}
