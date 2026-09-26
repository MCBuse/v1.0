import { ArrowRight } from "lucide-react";

/**
 * One block of a merchant page: title row with a hairline underneath, then content.
 * Shared by Overview and Payment so every block is demarcated the same way.
 */
export function PageSection({
  id,
  title,
  href,
  linkLabel,
  children,
}: {
  id: string;
  title: string;
  /** Optional route for the whole block, shown as "Open <title> →". */
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid scroll-mt-24 gap-4">
      <div className="flex min-h-11 items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <h2 id={id} className="text-xl font-semibold tracking-tight text-slate-950">
          {title}
        </h2>
        {href ? (
          <a
            href={href}
            className="flex min-h-11 items-center gap-1 text-sm font-semibold text-blue-700"
          >
            {linkLabel ?? `Open ${title}`} <ArrowRight size={16} aria-hidden="true" />
          </a>
        ) : null}
      </div>
      {children}
    </section>
  );
}
