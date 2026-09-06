import type { MoneyValue } from "@repo/shared";
import { cn } from "./cn";

export function formatMoney(value: Pick<MoneyValue, "minor" | "currency">) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: value.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(BigInt(value.minor)) / 100);
}

export function Money({
  value,
  className,
}: {
  value: MoneyValue;
  className?: string;
}) {
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {formatMoney(value)}
    </span>
  );
}
