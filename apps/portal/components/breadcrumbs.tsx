"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@repo/ui/cn";
import { breadcrumbsFor } from "@/lib/breadcrumbs";

const linkClass =
  "rounded-sm text-slate-500 transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600";

/**
 * Where you are in the merchant portal, built from the URL.
 * sm and up: the full trail. Phones: a back link to the parent plus the current page.
 */
export function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const trail = breadcrumbsFor(pathname);
  const current = trail[trail.length - 1]!;
  // Nearest ancestor that leads somewhere else (Analytics opens General analytics itself).
  const parent =
    trail
      .slice(0, -1)
      .filter((crumb) => crumb.href !== pathname)
      .at(-1) ?? null;

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <li key={crumb.label} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <ChevronRight
                  size={14}
                  className="shrink-0 text-slate-400"
                  aria-hidden="true"
                />
              ) : null}
              {last ? (
                <span
                  aria-current="page"
                  className="truncate font-medium text-slate-950"
                >
                  {crumb.label}
                </span>
              ) : crumb.href === pathname ? (
                // A grouping crumb whose landing page is the current page (Analytics on General analytics).
                <span className="truncate text-slate-500">{crumb.label}</span>
              ) : (
                <Link href={crumb.href} className={cn(linkClass, "truncate")}>
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      {parent ? (
        <div className="flex min-w-0 items-center gap-1.5 text-sm sm:hidden">
          <Link
            href={parent.href}
            className={cn(
              linkClass,
              "inline-flex min-h-9 shrink-0 items-center gap-0.5",
            )}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            {parent.label}
          </Link>
          <span aria-hidden="true" className="text-slate-300">
            /
          </span>
          <span
            aria-current="page"
            className="truncate font-medium text-slate-950"
          >
            {current.label}
          </span>
        </div>
      ) : (
        <span
          aria-current="page"
          className="text-sm font-medium text-slate-950 sm:hidden"
        >
          {current.label}
        </span>
      )}
    </nav>
  );
}
