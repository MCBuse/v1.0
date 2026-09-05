"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { NAV_ITEMS } from "./content";
import { linkFocusClass, primaryButtonClass } from "./primitives";

export function Wordmark({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onClick}
      className={`flex min-h-11 items-center gap-3 ${linkFocusClass}`}
    >
      {/* Interim brand mark — no logo asset exists yet. See brand.md. */}
      <span
        aria-hidden
        className="inline-flex h-8 w-8 items-center justify-center border border-border-strong bg-accent text-base font-bold leading-none text-on-accent"
      >
        M
      </span>
      <span className="text-base font-semibold tracking-[-0.01em] text-text">MCBuse</span>
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the sheet on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock scroll and allow Escape while the sheet is open.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Wordmark />

        <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative inline-flex min-h-11 items-center text-sm font-medium transition-colors duration-200 ${
                  active ? "text-text" : "text-muted hover:text-text"
                } ${linkFocusClass}`}
              >
                {item.label}
                {active && (
                  <span aria-hidden className="absolute inset-x-0 -bottom-[21px] h-0.5 bg-accent" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/contact#merchant-form"
            className={`${primaryButtonClass} hidden h-10 min-h-10 px-5 text-[12px] sm:inline-flex`}
          >
            Join the Pilot
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className={`inline-flex h-11 w-11 items-center justify-center border border-border-strong text-text transition-colors duration-200 hover:border-text lg:hidden ${linkFocusClass}`}
          >
            {open ? <X aria-hidden size={18} /> : <Menu aria-hidden size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <div
          id="mobile-nav"
          className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto border-t border-border bg-bg px-5 py-8 lg:hidden"
        >
          <nav aria-label="Main" className="flex flex-col">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`border-b border-border py-4 text-xl font-medium transition-colors duration-200 ${
                  isActive(item.href) ? "text-accent" : "text-text"
                } ${linkFocusClass}`}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/demo"
              className={`border-b border-border py-4 text-xl font-medium text-text ${linkFocusClass}`}
            >
              Sandbox Demo
            </Link>
            <Link
              href="/contact#merchant-form"
              className={`${primaryButtonClass} mt-8 w-full`}
            >
              Join the Pilot
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
