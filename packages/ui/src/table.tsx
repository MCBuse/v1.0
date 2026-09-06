/* eslint-disable react/prop-types */
import * as React from "react";
import { cn } from "./cn";

export function Table({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn("w-full border-collapse text-left text-sm", className)}
        {...props}
      />
    </div>
  );
}
export function TableHeader(
  props: React.HTMLAttributes<HTMLTableSectionElement>,
) {
  return (
    <thead
      className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"
      {...props}
    />
  );
}
export function TableBody(
  props: React.HTMLAttributes<HTMLTableSectionElement>,
) {
  return <tbody className="divide-y divide-slate-100" {...props} />;
}
export function TableRow(props: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className="hover:bg-slate-50" {...props} />;
}
export function TableHead(props: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className="px-4 py-3 font-semibold" {...props} />;
}
export function TableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-4 py-4 text-slate-700", className)} {...props} />
  );
}
