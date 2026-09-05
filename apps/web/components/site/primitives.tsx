import type { ReactNode } from "react";

/* ──────────────────────────────────────────────────────────────
   Interaction classes

   White means act. Blue means navigate or inform.
   Everything is square — see app/globals.css radius tokens.
   ────────────────────────────────────────────────────────────── */

export const linkFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

const buttonBase =
  "inline-flex h-12 min-h-12 items-center justify-center gap-2 border px-8 font-mono text-[13px] font-bold uppercase tracking-[0.08em] transition-colors duration-200";

export const primaryButtonClass = `${buttonBase} border-action bg-action text-on-action hover:bg-action-hover hover:border-action-hover ${linkFocusClass}`;

export const secondaryButtonClass = `${buttonBase} border-border-strong bg-transparent text-text hover:border-text hover:bg-white/[0.06] ${linkFocusClass}`;

export const tertiaryLinkClass = `inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-accent transition-colors duration-200 hover:text-accent-hover ${linkFocusClass}`;

/* ──────────────────────────────────────────────────────────────
   Section — the layout primitive.

   Evolved from the previous light-theme version: the `navy` tone
   became `ink`, and the header ternaries are gone because every
   tone is now dark.
   ────────────────────────────────────────────────────────────── */

type Tone = "bg" | "surface" | "ink" | "soft";

const toneClass: Record<Tone, string> = {
  bg: "bg-bg",
  surface: "bg-surface",
  ink: "bg-ink",
  soft: "bg-accent-soft",
};

type SectionProps = {
  id?: string;
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  title?: string;
  intro?: string;
  tone?: Tone;
  centered?: boolean;
  bordered?: boolean;
  /** Renders the band edge-to-edge while keeping content in the column. */
  fullBleed?: boolean;
};

export function Section({
  id,
  children,
  className,
  eyebrow,
  title,
  intro,
  tone = "bg",
  centered = false,
  bordered = false,
  fullBleed = false,
}: SectionProps) {
  const band = [
    "py-20 lg:py-28",
    // Full-bleed bands carry their own padded container in the page, so the
    // section must not add a second set of gutters.
    fullBleed ? "" : "px-5 sm:px-8",
    toneClass[tone],
    bordered ? "border-t border-border" : "",
    fullBleed ? "relative left-1/2 right-1/2 -mx-[50vw] w-screen" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section id={id} className={band}>
      <div className="mx-auto w-full max-w-6xl">
        {(eyebrow || title || intro) && (
          <div className={`mb-12 max-w-3xl lg:mb-16 ${centered ? "mx-auto text-center" : ""}`}>
            {eyebrow && <MonoEyebrow className="mb-4">{eyebrow}</MonoEyebrow>}
            {title && (
              <h2 className="text-3xl font-semibold leading-tight tracking-[-0.02em] text-text sm:text-4xl">
                {title}
              </h2>
            )}
            {intro && <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">{intro}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────
   MonoEyebrow — uppercase mono label with an optional status dot.
   The dot marks product stage. It never marks a metric.
   ────────────────────────────────────────────────────────────── */

export function MonoEyebrow({
  children,
  dot = false,
  className,
}: {
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <p
      className={`flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle ${className ?? ""}`}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-accent motion-safe:animate-pulse" />}
      {children}
    </p>
  );
}

/* ──────────────────────────────────────────────────────────────
   StatusChip — colour is never the only signal; every chip
   carries a word.
   ────────────────────────────────────────────────────────────── */

type ChipTone = "success" | "warning" | "error" | "accent" | "neutral";

const chipTone: Record<ChipTone, string> = {
  success: "border-success/40 bg-success-soft text-success",
  warning: "border-warning/40 bg-warning-soft text-warning",
  error: "border-error/40 bg-error-soft text-error",
  accent: "border-accent/40 bg-accent-soft text-accent",
  neutral: "border-border-strong bg-transparent text-subtle",
};

export function StatusChip({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: ChipTone;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] ${chipTone[tone]}`}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────
   Card — a bordered surface. Elevation comes from background
   shade, never shadow.
   ────────────────────────────────────────────────────────────── */

export function Card({
  children,
  className,
  interactive = false,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  as?: "div" | "li" | "article";
}) {
  return (
    <Tag
      className={[
        "border border-border bg-surface",
        interactive ? "transition-colors duration-200 hover:border-border-strong" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Tag>
  );
}

/* ──────────────────────────────────────────────────────────────
   GridBackdrop — decorative only, always hidden from AT.
   ────────────────────────────────────────────────────────────── */

export function GridBackdrop({ glow = false }: { glow?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="grid-backdrop absolute inset-0" />
      {glow && <div className="hero-glow absolute inset-x-0 top-0 h-[700px]" />}
    </div>
  );
}
