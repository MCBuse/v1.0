"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const VIEWS = [
  { href: "/analytics/general", label: "General analytics" },
  { href: "/analytics/deep", label: "Deep analytics" },
  { href: "/analytics/changes", label: "Change Intelligence" },
] as const;

/**
 * The switch between the three Analytics destinations. Every tab is always
 * shown; when Change Intelligence is unavailable (switched off, merchant not
 * enabled, or a non-owner), its page says so instead of the tab disappearing.
 */
export function AnalyticsNav() {
  const pathname = usePathname();
  const active = VIEWS.find(
    (view) => pathname === view.href || pathname.startsWith(`${view.href}/`),
  )?.href;
  // Route-driven tabs: each trigger is a link, so no TabsContent panels.
  return (
    <nav aria-label="Analytics views" className="min-w-0">
      <Tabs value={active ?? ""}>
        <TabsList className="max-w-full justify-start overflow-x-auto">
          {VIEWS.map((view) => (
            <TabsTrigger key={view.href} value={view.href} asChild>
              <Link href={view.href} aria-current={pathname === view.href ? "page" : undefined}>
                {view.label}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  );
}
