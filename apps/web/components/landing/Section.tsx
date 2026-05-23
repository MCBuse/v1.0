import type { ReactNode } from "react";

type Props = {
  id?: string;
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  title?: string;
  intro?: string;
};

export function Section({ id, children, className, eyebrow, title, intro }: Props) {
  return (
    <section
      id={id}
      className={`px-6 py-20 sm:px-10 md:py-28 ${className ?? ""}`}
    >
      <div className="mx-auto w-full max-w-[1180px]">
        {(eyebrow || title || intro) && (
          <div className="mb-12 max-w-2xl md:mb-16">
            {eyebrow && (
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-accent">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="text-3xl font-semibold leading-[1.1] text-text sm:text-4xl md:text-[44px]">
                {title}
              </h2>
            )}
            {intro && (
              <p className="mt-4 text-lg leading-relaxed text-muted">
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
