"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";

export type ChartBar = {
  key: string;
  label: string;
  /** Height is derived from this; formatting is the caller's business. */
  value: number;
  cells: string[];
};

/**
 * T.15 — a chart that can always be read as numbers.
 *
 * The bars carry an `aria-label` and a screen-reader table, and the same table
 * can be revealed on screen. A chart nobody can read the values off is a
 * decoration, and a hidden-only table leaves a sighted person squinting at bar
 * heights to answer "how much exactly?".
 */
export function ChartWithTable({
  label,
  bars,
  columns,
  emptyMessage = "No activity in this period.",
  height = "h-44",
}: {
  label: string;
  bars: ChartBar[];
  columns: string[];
  emptyMessage?: string;
  height?: string;
}) {
  const [open, setOpen] = useState(false);
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  const tableId = `chart-table-${label.replace(/\W+/g, "-").toLowerCase()}`;

  if (!bars.length)
    return <p className="py-6 text-sm text-slate-500">{emptyMessage}</p>;

  return (
    <div>
      <div
        className={`flex ${height} items-end gap-1.5`}
        role="img"
        aria-label={label}
      >
        {bars.map((bar) => (
          <div
            key={bar.key}
            className="group relative flex min-w-0 flex-1 items-end"
          >
            <div
              className="w-full rounded-t-sm bg-blue-100 transition-colors group-hover:bg-blue-500"
              style={{ height: `${Math.max(3, (bar.value / max) * 100)}%` }}
              title={`${bar.label}: ${bar.cells[0] ?? ""}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>{bars[0]?.label}</span>
        <span>{bars[bars.length - 1]?.label}</span>
      </div>

      <button
        type="button"
        className="mt-3 text-sm font-medium text-blue-700 underline-offset-4 hover:underline"
        aria-expanded={open}
        aria-controls={tableId}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "Hide the numbers" : "Show the numbers"}
      </button>

      <div id={tableId} hidden={!open} className="mt-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Period</TableHead>
              {columns.map((column) => (
                <TableHead key={column} scope="col">
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bars.map((bar) => (
              <TableRow key={bar.key}>
                <TableCell>{bar.label}</TableCell>
                {bar.cells.map((cell, index) => (
                  <TableCell
                    key={`${bar.key}-${columns[index] ?? index}`}
                    className="font-mono tabular-nums"
                  >
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Always present for assistive technology, whether or not it is shown. */}
      <table className="sr-table">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.key}>
              <td>{bar.label}</td>
              {bar.cells.map((cell, index) => (
                <td key={`${bar.key}-sr-${columns[index] ?? index}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
