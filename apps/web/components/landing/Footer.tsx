import { ArrowUpRight } from "lucide-react";
import { CONTACT_EMAIL, EXTERNAL_LINKS } from "./constants";
import { linkFocusClass } from "./Section";

const footerLinks = [
  ["Product", "#product"],
  ["Demo", "#demo"],
  ["Merchants", "#merchants"],
  ["Partners", "#partners"],
  ["About", "#about"],
  ["Contact", "#contact"],
] as const;

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-bold text-surface"
              >
                M
              </span>
              <span className="text-base font-semibold text-text">MCBuse</span>
            </div>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted">
              MCBuse is building financial data infrastructure for everyday
              micro-transactions, merchant activity, and partner-enabled access.
            </p>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted">
              MCBuse is not a bank or licensed payment institution. Regulated
              payment processing is handled by licensed partners.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-text">Explore</p>
            <div className="mt-4 grid gap-3 text-sm text-muted">
              {footerLinks.map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  className={`inline-flex min-h-10 w-fit items-center rounded-lg px-2 transition-colors hover:text-accent ${linkFocusClass}`}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-text">Connect</p>
            <div className="mt-4 grid gap-3 text-sm text-muted">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className={`inline-flex min-h-10 w-fit items-center gap-2 rounded-lg transition-colors hover:text-accent ${linkFocusClass}`}
              >
                {CONTACT_EMAIL}
                <ArrowUpRight aria-hidden size={15} />
              </a>
              <a
                href={EXTERNAL_LINKS.pilot}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex min-h-10 w-fit items-center gap-2 rounded-lg transition-colors hover:text-accent ${linkFocusClass}`}
              >
                Join the pilot
                <ArrowUpRight aria-hidden size={15} />
              </a>
              <span>Berlin and Munich pilot preparation</span>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} MCBuse. All rights reserved.</span>
          <span>Simple on the front end. Verifiable behind the scenes.</span>
        </div>
      </div>
    </footer>
  );
}
