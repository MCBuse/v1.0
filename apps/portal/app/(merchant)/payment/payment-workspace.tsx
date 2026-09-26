"use client";

import type { MerchantPaymentRequestPage } from "@repo/shared";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Money } from "@repo/ui/money";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  AccountsBlock,
  MoneyMovementCard,
  ProcessedPaymentsCard,
  useAccountsData,
} from "@/components/account-cards";
import { CounterDisplay } from "@/components/counter-display";
import { PageSection } from "@/components/page-section";
import { ReceivePaymentDrawer } from "@/components/receive-payment";
import { RecordCashSaleDrawer } from "@/components/record-cash-sale";
import { usePortalResource } from "@/lib/client/use-portal-resource";

const statusTone = (status: string) =>
  status === "completed"
    ? "success"
    : status === "failed"
      ? "danger"
      : status === "pending" || status === "processing"
        ? "info"
        : "neutral";

/** Payment in four blocks: Accounts → Process payments → Today's activity → Transactions data. */
export function PaymentWorkspace() {
  const { summary, operations } = useAccountsData();
  const requests = usePortalResource<MerchantPaymentRequestPage>(
    "me/payment-requests?page=1&pageSize=10",
    10_000,
  );

  return (
    <div className="grid gap-12">
      <div>
        <p className="text-sm font-medium text-blue-700">Payment</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Capture business activity
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Create a fast request, prepare an itemised invoice, or record a cash sale.
        </p>
      </div>

      <PageSection id="payment-accounts" title="Accounts">
        <AccountsBlock summary={summary} />
      </PageSection>

      <PageSection id="payment-process" title="Process payments">
        <div className="grid gap-4 md:grid-cols-3">
          <ActionCard
            title="Digital payment"
            description="Create a QR request and keep its payment status in one place."
          >
            <ReceivePaymentDrawer />
          </ActionCard>
          <ActionCard
            title="Itemised invoices"
            description="Use products and quantities for a structured commercial sale."
          >
            <Button asChild variant="secondary">
              <Link href="/payment/invoices">Open invoices</Link>
            </Button>
          </ActionCard>
          <ActionCard
            title="Cash payment"
            description="Record merchant-declared cash activity separately from verified payments."
          >
            <RecordCashSaleDrawer />
          </ActionCard>
        </div>
      </PageSection>

      <PageSection id="payment-today" title="Today's payment activity">
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <ProcessedPaymentsCard summary={summary} />
          <MoneyMovementCard operations={operations} />
          <CounterDisplay />
          <Card className="h-full">
            <CardHeader>
              <h3 className="font-semibold">Fast payment requests</h3>
            </CardHeader>
            <CardContent className="grid gap-3">
              {requests.loading && !requests.data ? (
                <p className="text-sm text-slate-500">Loading payment requests…</p>
              ) : requests.data?.items.length ? (
                requests.data.items.map((request) => (
                  <div
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-950">
                        {request.description || "Payment request"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Created{" "}
                        {new Intl.DateTimeFormat("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(request.createdAt))}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Money value={request.amount} className="font-semibold text-slate-950" />
                      <Badge tone={statusTone(request.status)}>{request.status}</Badge>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  No fast payment requests yet. Create one above to begin.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </PageSection>

      <PageSection id="payment-data" title="Transactions data">
        <div className="grid gap-4 md:grid-cols-2">
          <LinkCard href="/analytics/transactions" title="Transactions" />
          <LinkCard href="/analytics/transactions#receipts" title="Receipts" />
        </div>
      </PageSection>
    </div>
  );
}

function ActionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <h3 className="font-semibold">{title}</h3>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <p className="mb-4 text-sm text-slate-500">{description}</p>
        <div className="mt-auto">{children}</div>
      </CardContent>
    </Card>
  );
}

function LinkCard({ href, title }: { href: string; title: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-16 items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 font-semibold text-slate-950 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
    >
      {title}
      <ArrowRight size={16} aria-hidden="true" className="text-slate-400" />
    </Link>
  );
}
