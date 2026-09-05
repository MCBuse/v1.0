import Link from "next/link";
import type { ReactNode } from "react";

import { primaryButtonClass, secondaryButtonClass } from "./primitives";

type Action = { label: string; href: string; external?: boolean };

export function CtaStrip({
  title,
  body,
  primary,
  secondary,
  children,
}: {
  title: string;
  body: string;
  primary: Action;
  secondary?: Action;
  children?: ReactNode;
}) {
  return (
    <section className="px-5 py-20 sm:px-8 lg:py-24">
      <div className="mx-auto w-full max-w-6xl border border-border bg-surface px-8 py-14 text-center sm:px-12 lg:py-20">
        <h2 className="mx-auto max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.02em] text-text sm:text-4xl">
          {title}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">{body}</p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
          <Link href={primary.href} className={`${primaryButtonClass} w-full sm:w-auto`}>
            {primary.label}
          </Link>
          {secondary && (
            <Link href={secondary.href} className={`${secondaryButtonClass} w-full sm:w-auto`}>
              {secondary.label}
            </Link>
          )}
        </div>

        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}
