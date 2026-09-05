"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The previous site was a single page with anchor sections. Those links are
 * still in the wild, and a hash fragment never reaches the server — so the
 * redirect has to happen here.
 */
const HASH_ROUTES: Record<string, string> = {
  product: "/product",
  merchants: "/merchants",
  partners: "/partners",
  roadmap: "/roadmap",
  about: "/company",
  team: "/company",
  contact: "/contact",
  demo: "/demo",
  sandbox: "/demo#sandbox",
  market: "/merchants",
  blockchain: "/product",
  why: "/",
};

export function HashRedirect() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    const target = HASH_ROUTES[hash];
    if (target && target !== "/") {
      router.replace(target);
    }
  }, [router]);

  return null;
}
