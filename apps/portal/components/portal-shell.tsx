"use client";

import { cn } from "@repo/ui/cn";
import { NavigationItem } from "@repo/ui/navigation";
import type { MerchantSummary } from "@repo/shared";
import {
  Building2,
  CircleDollarSign,
  ChartNoAxesCombined,
  LayoutDashboard,
  Landmark,
  Package,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { LogoutButton } from "./logout-button";
import { ReceivePaymentDrawer } from "./receive-payment";
import { usePortalResource } from "@/lib/client/use-portal-resource";

const navigation = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/payment", label: "Payment", icon: CircleDollarSign },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesCombined },
  { href: "/credit-assessment", label: "Credit Assessment", icon: Building2 },
  { href: "/finance-match", label: "Finance Match", icon: Landmark },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const connection = usePortalResource<MerchantSummary>("me/summary", 60_000);
  const stale = connection.data
    ? Date.now() - new Date(connection.data.lastUpdatedAt).getTime() > 90_000
    : false;
  const connectionLabel = connection.loading
    ? "Checking records"
    : connection.offline || connection.error
      ? "Records unavailable"
      : stale
        ? "Records delayed"
        : `Records updated ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(connection.data!.lastUpdatedAt))}`;
  return (
    <div className="min-h-dvh bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <nav aria-label="Primary" className="mt-10 grid gap-1">
          {navigation.map(({ href, label, icon: Icon }) => (
            <NavigationItem
              key={href}
              href={href}
              active={pathname === href || pathname.startsWith(`${href}/`)}
              icon={<Icon size={19} />}
            >
              {label}
            </NavigationItem>
          ))}
        </nav>
        <div className="mt-auto border-t border-slate-200 pt-4">
          <LogoutButton />
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur lg:px-8">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="hidden lg:block">
            <p className="text-sm font-medium text-slate-500">
              Merchant workspace
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="hidden items-center gap-2 sm:flex"
              title={connectionLabel}
            >
              <span className="text-xs text-slate-500">{connectionLabel}</span>
              <span
                className={`size-2 rounded-full ${connection.offline || connection.error ? "bg-rose-500" : connection.loading || stale ? "bg-amber-400" : "bg-emerald-500"}`}
                aria-label={connectionLabel}
              />
            </div>
            <ReceivePaymentDrawer />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>
      <nav
        aria-label="Mobile"
        className="fixed inset-x-0 bottom-0 z-40 grid h-[4.75rem] grid-cols-6 border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {navigation.map(({ href, label, icon: Icon }) => (
          <a
            key={href}
            href={href}
            aria-current={
              pathname === href || pathname.startsWith(`${href}/`)
                ? "page"
                : undefined
            }
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-1 text-[10px] sm:text-[11px] font-medium",
              pathname === href || pathname.startsWith(`${href}/`)
                ? "text-blue-700"
                : "text-slate-500",
            )}
          >
            <Icon size={20} aria-hidden="true" />
            <span>
              {label === "Credit Assessment"
                ? "Assessment"
                : label === "Finance Match"
                  ? "Finance"
                  : label}
            </span>
          </a>
        ))}
      </nav>
    </div>
  );
}
