import type { Metadata } from "next";

import { LegalStub } from "../../components/site/LegalStub";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The terms governing use of the MCBuse website and sandbox.",
  robots: { index: false },
};

export default function TermsPage() {
  return (
    <LegalStub
      eyebrow="Legal"
      title="Terms of Use"
      intro="The terms governing use of this website and the MCBuse sandbox environment."
      note="Our terms of use are being prepared and are not yet published. The sandbox is provided for testing, validation and product demonstration only — it is not a production payment or lending product, and some features are simulated. Contact us if you need written terms before taking part in the pilot."
    />
  );
}
