"use client";

import { Button } from "@repo/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** "1–25 of 132" with Previous / Next. Always shown so the list size is visible; buttons disable at the ends. */
export function PaginationFooter({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  label,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  label: string;
}) {
  if (totalItems <= 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);
  return (
    <nav
      aria-label={label}
      className="flex items-center justify-between gap-4 border-t border-slate-200 px-5 py-3"
    >
      <p className="text-sm text-slate-500" aria-live="polite">
        <span className="font-mono tabular-nums">
          {first}–{last}
        </span>{" "}
        of <span className="font-mono tabular-nums">{totalItems}</span>
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Previous
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
