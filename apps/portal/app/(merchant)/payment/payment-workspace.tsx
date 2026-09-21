"use client";

import type { MerchantPaymentRequestPage } from "@repo/shared";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Money } from "@repo/ui/money";
import Link from "next/link";
import { AccountCards } from "@/components/account-cards";
import { CounterDisplay } from "@/components/counter-display";
import { DayEndPanel } from "@/components/day-end-panel";
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

export function PaymentWorkspace() {
  const requests = usePortalResource<MerchantPaymentRequestPage>(
    "me/payment-requests?page=1&pageSize=10",
    10_000,
  );
  return <div className="grid gap-6">
    <div><p className="text-sm font-medium text-blue-700">Payment</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Capture business activity</h1><p className="mt-2 text-sm text-slate-500">Create a fast request, prepare an itemised invoice, or record a cash sale.</p></div>
    <AccountCards />
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><h2 className="font-semibold">Digital payment</h2></CardHeader><CardContent><p className="mb-4 text-sm text-slate-500">Create a QR request and keep its payment status in one place.</p><ReceivePaymentDrawer /></CardContent></Card>
      <Card><CardHeader><h2 className="font-semibold">Itemised invoices</h2></CardHeader><CardContent><p className="mb-4 text-sm text-slate-500">Use products and quantities for a structured commercial sale.</p><Button asChild variant="secondary"><Link href="/payment/invoices">Open invoices</Link></Button></CardContent></Card>
      <Card><CardHeader><h2 className="font-semibold">Cash sale</h2></CardHeader><CardContent><p className="mb-4 text-sm text-slate-500">Record merchant-declared cash activity separately from verified payments.</p><RecordCashSaleDrawer /></CardContent></Card>
    </div>
    <Card><CardHeader><h2 className="font-semibold">Fast payment requests</h2></CardHeader><CardContent className="grid gap-3">{requests.loading && !requests.data ? <p className="text-sm text-slate-500">Loading payment requests…</p> : requests.data?.items.length ? requests.data.items.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"><div><p className="text-sm font-medium text-slate-950">{request.description || "Payment request"}</p><p className="mt-1 text-xs text-slate-500">Created {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(request.createdAt))}</p></div><div className="flex items-center gap-3"><Money value={request.amount} className="font-semibold text-slate-950"/><Badge tone={statusTone(request.status)}>{request.status}</Badge></div></div>) : <p className="text-sm text-slate-500">No fast payment requests yet. Create one above to begin.</p>}</CardContent></Card>
    <CounterDisplay />
    <DayEndPanel />
    <Card><CardHeader><h2 className="font-semibold">Receipts and payment status</h2></CardHeader><CardContent><Button asChild variant="secondary"><Link href="/analytics/transactions">Open transactions and receipts</Link></Button></CardContent></Card>
  </div>;
}
