"use client";

import { usePathname } from "next/navigation";

import { BOUNDARY } from "./content";

/**
 * Routes that replace the default B1 statement with their own
 * (handover §2). B2 always follows, on every route.
 */
const OVERRIDES: Record<string, string> = {
  "/merchants": BOUNDARY.b3,
  "/partners": BOUNDARY.b4,
  "/roadmap": BOUNDARY.b5,
};

export function FooterBoundary() {
  const pathname = usePathname();
  const boundary = OVERRIDES[pathname] ?? BOUNDARY.b1;

  return (
    <>
      <p className="max-w-4xl text-xs leading-relaxed text-subtle">{boundary}</p>
      <p className="mt-3 text-xs leading-relaxed text-subtle">{BOUNDARY.b2}</p>
    </>
  );
}
