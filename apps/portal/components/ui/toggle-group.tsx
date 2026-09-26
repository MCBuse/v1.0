"use client";

import * as React from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui ToggleGroup, styled as a segmented control: one quiet track,
 * the selected segment lifted onto white with a hairline.
 */
function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn(
        "inline-flex h-9 items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-100 p-0.5",
        className,
      )}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex h-full min-w-10 items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap text-slate-600 transition-colors outline-none",
        "hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-600 disabled:pointer-events-none disabled:opacity-50",
        "data-[state=on]:bg-white data-[state=on]:text-slate-950 data-[state=on]:ring-1 data-[state=on]:ring-slate-200",
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
