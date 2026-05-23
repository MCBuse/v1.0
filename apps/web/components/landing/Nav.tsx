import { PILOT_FORM_URL } from "./constants";

export function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-[1.5px] bg-accent opacity-80" />
      <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between px-6 sm:px-10">
        <a href="#top" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[13px] font-bold text-bg"
          >
            M
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-text">
            MCBuse
          </span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
          <a href="#problem" className="transition-colors hover:text-text">
            Problem
          </a>
          <a href="#solution" className="transition-colors hover:text-text">
            Solution
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-text">
            How it works
          </a>
          <a href="#pilot" className="transition-colors hover:text-text">
            Pilot
          </a>
        </nav>
        <a
          href={PILOT_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-medium text-bg transition-colors hover:bg-accent-hover"
        >
          Join the pilot
        </a>
      </div>
    </header>
  );
}
