import { CONTACT_EMAIL } from "./constants";

export function Footer() {
  return (
    <footer className="border-t border-border bg-bg">
      <div className="mx-auto w-full max-w-[1180px] px-6 py-12 sm:px-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-strong bg-surface text-[13px] font-bold text-text"
              >
                M
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-text">
                MCBuse
              </span>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              MCBuse is not a bank or licensed payment institution. Regulated
              payment processing is handled by licensed partners.
            </p>
            <p className="mt-3 font-mono text-[11px] text-subtle">
              Built on Solana
            </p>
          </div>

          <div className="flex flex-col gap-3 text-[14px] text-muted md:items-end">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="transition-colors hover:text-text"
            >
              {CONTACT_EMAIL}
            </a>
            <span className="text-subtle">Munich · Berlin</span>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-[12px] text-subtle md:flex-row md:items-center md:justify-between">
          <span>© {new Date().getFullYear()} MCBuse. All rights reserved.</span>
          <span>Made for small merchants.</span>
        </div>
      </div>
    </footer>
  );
}
