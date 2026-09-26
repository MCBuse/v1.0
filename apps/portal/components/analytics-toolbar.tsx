"use client";

import { PlusCircle, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Recorded-activity sources the analytics endpoints can narrow to. */
export const SOURCE_OPTIONS = [
  { value: "mcbuse_payment", label: "Digital" },
  { value: "merchant_cash", label: "Cash" },
] as const;

/**
 * shadcn data-table style facet: a dashed "+ Title" button that, once a value
 * is chosen, shows that value inline. `null` means no filter (everything).
 */
export function FacetFilter({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium text-slate-700 transition-colors outline-none",
          "hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-600 data-[state=open]:bg-slate-50",
          selected ? "border-slate-300" : "border-dashed border-slate-300",
        )}
      >
        <PlusCircle
          className={cn("size-4 text-slate-400", selected && "rotate-45")}
          aria-hidden
        />
        {title}
        {selected ? (
          <>
            <span className="h-4 w-px bg-slate-200" aria-hidden />
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-950">
              {selected.label}
            </span>
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value ?? ""}
          onValueChange={(next) => onChange(next || null)}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {selected ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="justify-center text-slate-600"
              onSelect={() => onChange(null)}
            >
              Clear filter
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Ghost "Reset" shown only when a filter differs from its default. */
export function ResetFilters({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={onReset}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 transition-colors outline-none hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-600"
    >
      Reset
      <X className="size-4" aria-hidden />
    </button>
  );
}
