import { ArrowRight } from "lucide-react";
import { EXTERNAL_LINKS } from "./constants";
import { linkFocusClass } from "./Section";

const navItems = [
  ["Product", "#product"],
  ["Demo", "#demo"],
  ["Merchants", "#merchants"],
  ["Partners", "#partners"],
  ["About", "#about"],
  ["Contact", "#contact"],
] as const;

export function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <a
          href="#top"
          className={`flex min-h-11 items-center gap-3 rounded-lg ${linkFocusClass}`}
        >
          <span
            aria-hidden
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-bold text-surface"
          >
            M
          </span>
          <span className="text-base font-semibold text-text">MCBuse</span>
        </a>

        <nav className="hidden items-center gap-5 text-sm font-medium text-muted lg:flex">
          {navItems.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className={`inline-flex min-h-10 items-center rounded-lg px-2 transition-colors hover:text-text ${linkFocusClass}`}
            >
              {label}
            </a>
          ))}
        </nav>

        <a
          href={EXTERNAL_LINKS.pilot}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-accent-hover ${linkFocusClass}`}
        >
          Join the Pilot
          <ArrowRight aria-hidden size={16} />
        </a>
      </div>
    </header>
  );
}
