"use client";

import {
  Dialog,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  SheetContent,
} from "@repo/ui/dialog";
import { NavigationItem } from "@repo/ui/navigation";
import {
  Building2,
  CircleDollarSign,
  LayoutDashboard,
  ReceiptText,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { LogoutButton } from "./logout-button";
import { ReceivePayment } from "./receive-payment";

const navigation = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/business-profile", label: "Business profile", icon: Building2 },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
              active={pathname === href}
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
      <div className="lg:pl-60 xl:pr-[23rem]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur lg:px-8">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="hidden lg:block">
            <p className="text-sm font-medium text-slate-500">
              Merchant workspace
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-slate-400 sm:inline">
              Live records
            </span>
            <span
              className="size-2 rounded-full bg-emerald-500"
              aria-label="Live data connected"
            />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>
      <aside className="fixed inset-y-0 right-0 hidden w-[23rem] overflow-y-auto border-l border-slate-200 bg-white px-6 py-8 xl:block">
        <ReceivePayment />
      </aside>
      <nav
        aria-label="Mobile"
        className="fixed inset-x-0 bottom-0 z-40 grid h-[4.75rem] grid-cols-4 border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {navigation.map(({ href, label, icon: Icon }) => (
          <a
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={`flex min-h-11 flex-col items-center justify-center gap-1 text-[11px] font-medium ${pathname === href ? "text-blue-700" : "text-slate-500"}`}
          >
            <Icon size={20} />
            <span>{label === "Business profile" ? "Profile" : label}</span>
          </a>
        ))}
        <Dialog>
          <DialogTrigger className="flex min-h-11 flex-col items-center justify-center gap-1 text-[11px] font-medium text-blue-700">
            <CircleDollarSign size={20} />
            <span>Receive</span>
          </DialogTrigger>
          <SheetContent>
            <DialogTitle className="sr-only">Receive payment</DialogTitle>
            <DialogDescription className="sr-only">
              Create a euro payment request for a customer to scan.
            </DialogDescription>
            <ReceivePayment compact />
          </SheetContent>
        </Dialog>
      </nav>
    </div>
  );
}
