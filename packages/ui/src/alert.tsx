import * as React from "react";
import { cn } from "./cn";

export function Alert({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700",
        className,
      )}
      {...props}
    />
  );
}
