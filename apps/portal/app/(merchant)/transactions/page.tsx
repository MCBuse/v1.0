import { Suspense } from "react";
import { Skeleton } from "@repo/ui/skeleton";
import { TransactionsView } from "./transactions-view";

export const metadata = { title: "Transactions" };
export default function TransactionsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <TransactionsView />
    </Suspense>
  );
}
