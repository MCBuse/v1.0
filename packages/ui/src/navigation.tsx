import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export function NavigationItem({
  active,
  icon,
  children,
  className,
  ...props
}: ComponentProps<"a"> & { active?: boolean; icon?: ReactNode }) {
  return (
    <a
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600",
        active && "bg-blue-50 text-blue-700",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </a>
  );
}
