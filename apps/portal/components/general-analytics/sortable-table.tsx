"use client";

import { Button } from "@repo/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

export type SortableColumn<T> = {
  key: string;
  label: string;
  /** What the column sorts on; strings sort as text, numbers numerically. */
  sortValue: (row: T) => number | string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
};

/**
 * V.9 — a detail table that can be sorted and paged.
 *
 * A merchant with three hundred products cannot answer "what is not selling?"
 * from a list cut off at the first twenty in insertion order.
 */
export function SortableTable<T>({
  caption,
  rows,
  columns,
  rowKey,
  initialSort,
  pageSize = 10,
  emptyMessage = "Nothing to show for this period.",
}: {
  caption: string;
  rows: T[];
  columns: SortableColumn<T>[];
  rowKey: (row: T) => string;
  initialSort?: { key: string; direction: "asc" | "desc" };
  pageSize?: number;
  emptyMessage?: string;
}) {
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" }>(
    initialSort ?? { key: columns[0]?.key ?? "", direction: "asc" },
  );
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const column = columns.find((entry) => entry.key === sort.key);
    if (!column) return rows;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = column.sortValue(a);
      const right = column.sortValue(b);
      if (typeof left === "number" && typeof right === "number")
        return (left - right) * factor;
      return String(left).localeCompare(String(right)) * factor;
    });
  }, [columns, rows, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = sorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  function toggle(key: string) {
    setPage(1);
    setSort((current) =>
      current.key === key
        ? {
            key,
            direction: current.direction === "asc" ? "desc" : "asc",
          }
        : { key, direction: "desc" },
    );
  }

  if (!rows.length)
    return <p className="py-6 text-sm text-slate-500">{emptyMessage}</p>;

  return (
    <div className="grid gap-3">
      <Table aria-label={caption}>
        <TableHeader>
          <TableRow>
            {columns.map((column) => {
              const active = sort.key === column.key;
              const Icon = !active
                ? ChevronsUpDown
                : sort.direction === "asc"
                  ? ArrowUp
                  : ArrowDown;
              return (
                <TableHead
                  key={column.key}
                  scope="col"
                  aria-sort={
                    active
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={column.numeric ? "text-right" : undefined}
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold hover:text-slate-950"
                    onClick={() => toggle(column.key)}
                  >
                    {column.label}
                    <Icon className="size-3.5 text-slate-400" aria-hidden />
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={
                    column.numeric
                      ? "text-right font-mono tabular-nums"
                      : undefined
                  }
                >
                  {column.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
        <span>
          Showing {(currentPage - 1) * pageSize + 1}–
          {Math.min(currentPage * pageSize, sorted.length)} of {sorted.length}
        </span>
        <span className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </Button>
          <span aria-live="polite">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </Button>
        </span>
      </div>
    </div>
  );
}
