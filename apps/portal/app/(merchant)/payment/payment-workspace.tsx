"use client";

import type {
  MerchantActivityPage,
  MerchantPaymentRequestPage,
} from "@repo/shared";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Money } from "@repo/ui/money";
import { List, ReceiptText } from "lucide-react";
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

const RECENT_LIMIT = 5;

const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

const statusTone = (status: string) =>
  status === "completed"
    ? "success"
    : status === "failed"
      ? "danger"
      : status === "pending" || status === "processing"
        ? "info"
        : "neutral";

/**
 * Payment in four blocks: Accounts → Process payments → Today's activity →
 * Counter display. Today's activity shows the last five payment requests next
 * to the last five recorded transactions; the full lists stay one click away
 * under Transactions and Receipts in the page header.
 */
export function PaymentWorkspace() {
  const { summary, operations } = useAccountsData();
  const requests = usePortalResource<MerchantPaymentRequestPage>(
    `me/payment-requests?page=1&pageSize=${RECENT_LIMIT}`,
    10_000,
  );
  const activity = usePortalResource<MerchantActivityPage>(
    `me/activity?page=1&pageSize=${RECENT_LIMIT}`,
    10_000,
  );

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            Capture business activity
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Create a fast request, prepare an itemised invoice, or record a cash sale.
          </p>
        </div>
        <nav aria-label="Payment records" className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href="/payment/transactions">
              <List aria-hidden="true" className="size-4" /> Transactions
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/payment/transactions#receipts">
              <ReceiptText aria-hidden="true" className="size-4" /> Receipts
            </Link>
          </Button>
        </nav>
      </div>

      <PageSection id="payment-accounts" title="Accounts" framed>
        <AccountsBlock summary={summary} />
      </PageSection>

      <PageSection id="payment-process" title="Process payments" framed>
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

      <PageSection id="payment-today" title="Today's payment activity" framed>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <ProcessedPaymentsCard summary={summary} />
          <MoneyMovementCard operations={operations} />
          <RecentListCard
            title="Last 5 payment requests"
            loading={requests.loading && !requests.data}
            loadingText="Loading payment requests…"
            emptyText="No payment requests yet. Create one above to begin."
            footerHref="/payment/transactions"
            footerLabel="All transactions"
            rows={(requests.data?.items ?? []).slice(0, RECENT_LIMIT).map((request) => ({
              id: request.id,
              title: request.description || "Payment request",
              meta: `Created ${dateTime.format(new Date(request.createdAt))}`,
              amount: request.amount,
              badge: <Badge tone={statusTone(request.status)}>{request.status}</Badge>,
            }))}
          />
          <RecentListCard
            title="Last 5 transactions"
            loading={activity.loading && !activity.data}
            loadingText="Loading transactions…"
            emptyText="No recorded sales yet. Digital payments and cash sales will appear here."
            footerHref="/payment/transactions"
            footerLabel="All transactions"
            rows={(activity.data?.items ?? []).slice(0, RECENT_LIMIT).map((item) => ({
              id: item.id,
              title: item.description || "Sale",
              meta: dateTime.format(new Date(item.occurredAt)),
              amount: item.amount,
              muted: item.status === "voided",
              badge: (
                <Badge
                  tone={
                    item.status === "voided"
                      ? "neutral"
                      : item.source === "mcbuse_payment"
                        ? "success"
                        : "neutral"
                  }
                >
                  {item.status === "voided"
                    ? "Voided"
                    : item.source === "mcbuse_payment"
                      ? "Digital"
                      : "Cash"}
                </Badge>
              ),
            }))}
          />
        </div>
      </PageSection>

      <PageSection id="payment-counter" title="Counter display" framed>
        <CounterDisplay />
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

type RecentRow = {
  id: string;
  title: string;
  meta: string;
  amount: React.ComponentProps<typeof Money>["value"];
  badge: React.ReactNode;
  muted?: boolean;
};

function RecentListCard({
  title,
  rows,
  loading,
  loadingText,
  emptyText,
  footerHref,
  footerLabel,
}: {
  title: string;
  rows: RecentRow[];
  loading: boolean;
  loadingText: string;
  emptyText: string;
  footerHref: string;
  footerLabel: string;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <Link
          href={footerHref}
          className="text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline"
        >
          {footerLabel}
        </Link>
      </CardHeader>
      <CardContent className="grid gap-3">
        {loading ? (
          <p className="text-sm text-slate-500">{loadingText}</p>
        ) : rows.length ? (
          <ol className="grid gap-3">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p
                    className={`truncate text-sm font-medium ${row.muted ? "text-slate-400 line-through" : "text-slate-950"}`}
                  >
                    {row.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{row.meta}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Money
                    value={row.amount}
                    className={`font-semibold ${row.muted ? "text-slate-400" : "text-slate-950"}`}
                  />
                  {row.badge}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">{emptyText}</p>
        )}
      </CardContent>
    </Card>
  );
}
