"use client";

import type { ChangeStatusResponse } from "@repo/shared";
import { Button } from "@repo/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { portalApi } from "@/lib/client/api";

const VIEWS = [
  { href: "/analytics/general", label: "General analytics" },
  { href: "/analytics/deep", label: "Deep analytics" },
  { href: "/analytics/changes", label: "Changes" },
] as const;

/**
 * The switch between the three Analytics destinations. Changes is listed only
 * when the status endpoint says the feature is available: non-owner members
 * get a 404 there, and a merchant without the feature gets `available: false`.
 *
 * `changesAvailable` lets the Changes pages pass what they already polled
 * instead of asking again.
 */
export function AnalyticsNav({ changesAvailable }: { changesAvailable?: boolean }) {
  const pathname = usePathname();
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (changesAvailable !== undefined) return;
    let active = true;
    portalApi<ChangeStatusResponse>("me/changes/status")
      .then((status) => {
        if (active) setFetched(status.available);
      })
      .catch(() => {
        if (active) setFetched(false);
      });
    return () => {
      active = false;
    };
  }, [changesAvailable]);

  const showChanges = changesAvailable ?? fetched;
  return (
    <nav aria-label="Analytics views" className="flex flex-wrap gap-2">
      {VIEWS.filter((view) => view.href !== "/analytics/changes" || showChanges).map((view) => {
        const exact = pathname === view.href;
        const within = exact || pathname.startsWith(`${view.href}/`);
        return (
          <Button key={view.href} asChild variant={within ? "primary" : "secondary"}>
            <Link
              href={view.href}
              aria-current={exact ? "page" : within ? "true" : undefined}
            >
              {view.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
