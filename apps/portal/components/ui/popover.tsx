"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/** shadcn/ui Popover on Radix, styled like SelectContent. */
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

function PopoverContent({
  className,
  align = "end",
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={4}
        className={cn(
          "z-50 rounded-lg border border-slate-200 bg-popover p-3 text-popover-foreground shadow-lg outline-none",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
