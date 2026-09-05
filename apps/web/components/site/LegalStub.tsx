import { FileText } from "lucide-react";

import { CONTACT_EMAIL, EXTERNAL_LINKS } from "../landing/constants";
import { MonoEyebrow, Section, secondaryButtonClass } from "./primitives";

/**
 * Placeholder for a legally operative document that has not been published yet.
 * Deliberately does not contain invented legal text — see handover §12.
 */
export function LegalStub({
  eyebrow,
  title,
  intro,
  note,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  note: string;
}) {
  return (
    <Section>
      <div className="max-w-2xl">
        <MonoEyebrow className="mb-5">{eyebrow}</MonoEyebrow>
        <h1 className="text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-text sm:text-5xl">
          {title}
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">{intro}</p>

        <div className="mt-10 flex items-start gap-3 border border-border bg-surface p-6">
          <FileText aria-hidden size={20} className="mt-0.5 shrink-0 text-subtle" />
          <p className="text-[15px] leading-relaxed text-muted">{note}</p>
        </div>

        <a href={EXTERNAL_LINKS.contact} className={`${secondaryButtonClass} mt-8`}>
          Email {CONTACT_EMAIL}
        </a>
      </div>
    </Section>
  );
}
