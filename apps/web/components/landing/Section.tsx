import type { ReactNode } from "react";

type Tone = "default" | "surface" | "soft" | "navy";

type Props = {
  id?: string;
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  title?: string;
  intro?: string;
  tone?: Tone;
  centered?: boolean;
};

const toneClass: Record<Tone, string> = {
  default: "bg-bg text-text",
  surface: "bg-surface text-text",
  soft: "bg-accent-soft text-text",
  navy: "bg-navy text-surface",
};

export function Section({
  id,
  children,
  className,
  eyebrow,
  title,
  intro,
  tone = "default",
  centered = false,
}: Props) {
  return (
    <section
      id={id}
      className={`px-5 py-16 sm:px-8 lg:py-24 ${toneClass[tone]} ${className ?? ""}`}
    >
      <div className="mx-auto w-full max-w-6xl">
        {(eyebrow || title || intro) && (
          <div
            className={`mb-10 max-w-3xl lg:mb-14 ${
              centered ? "mx-auto text-center" : ""
            }`}
          >
            {eyebrow && (
              <p
                className={`mb-3 text-xs font-semibold uppercase ${
                  tone === "navy" ? "text-border-strong" : "text-accent"
                }`}
              >
                {eyebrow}
              </p>
            )}
            {title && (
              <h2
                className={`text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl ${
                  tone === "navy" ? "text-surface" : "text-text"
                }`}
              >
                {title}
              </h2>
            )}
            {intro && (
              <p
                className={`mt-4 text-base leading-7 sm:text-lg ${
                  tone === "navy" ? "text-border" : "text-muted"
                }`}
              >
                {intro}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

export const linkFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

export const primaryButtonClass = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-surface transition-colors hover:bg-accent-hover ${linkFocusClass}`;

export const secondaryButtonClass = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-5 py-3 text-sm font-semibold text-text transition-colors hover:border-accent hover:text-accent ${linkFocusClass}`;

export const navyButtonClass = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-surface px-5 py-3 text-sm font-semibold text-navy transition-colors hover:bg-accent-soft ${linkFocusClass}`;
