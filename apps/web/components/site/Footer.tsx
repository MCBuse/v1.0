import Link from "next/link";

import { CONTACT_EMAIL, EXTERNAL_LINKS, outboundProps } from "../landing/constants";
import { FOOTER_COLUMNS } from "./content";
import { FooterBoundary } from "./FooterBoundary";
import { linkFocusClass } from "./primitives";
import { Wordmark } from "./Nav";

export function Footer() {
  return (
    <footer className="border-t border-border bg-ink px-5 pb-12 pt-20 sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Wordmark />
            <p className="mt-4 max-w-[26ch] text-sm leading-relaxed text-muted">
              Structured financial visibility for micro-merchants.
            </p>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div key={col.heading}>
              <h2 className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">
                {col.heading}
              </h2>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={`inline-flex min-h-8 items-center text-sm text-muted transition-colors duration-200 hover:text-text ${linkFocusClass}`}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h2 className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">
              Connect
            </h2>
            <ul className="space-y-3">
              <li>
                <a
                  href={EXTERNAL_LINKS.contact}
                  className={`inline-flex min-h-8 items-center font-mono text-sm text-muted transition-colors duration-200 hover:text-text ${linkFocusClass}`}
                >
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li>
                <a
                  href="https://www.linkedin.com/company/mcbuse"
                  {...outboundProps("https://www.linkedin.com/company/mcbuse")}
                  className={`inline-flex min-h-8 items-center text-sm text-muted transition-colors duration-200 hover:text-text ${linkFocusClass}`}
                >
                  LinkedIn
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-8">
          <FooterBoundary />
          <p className="mt-6 font-mono text-xs text-subtle">
            © {new Date().getFullYear()} MCBuse
          </p>
        </div>
      </div>
    </footer>
  );
}
