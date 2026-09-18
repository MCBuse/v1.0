"use client";

import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import Link from "next/link";
import { ReceivePaymentDrawer } from "@/components/receive-payment";
import { RecordCashSaleDrawer } from "@/components/record-cash-sale";

export function PaymentWorkspace() {
  return <div className="grid gap-6">
    <div><p className="text-sm font-medium text-blue-700">Payment</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Capture business activity</h1><p className="mt-2 text-sm text-slate-500">Create a fast request, prepare an itemised invoice, or record a cash sale.</p></div>
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><h2 className="font-semibold">Digital payment</h2></CardHeader><CardContent><p className="mb-4 text-sm text-slate-500">Create a QR request and keep its payment status in one place.</p><ReceivePaymentDrawer /></CardContent></Card>
      <Card><CardHeader><h2 className="font-semibold">Itemised invoices</h2></CardHeader><CardContent><p className="mb-4 text-sm text-slate-500">Use products and quantities for a structured commercial sale.</p><Button asChild variant="secondary"><Link href="/payment/invoices">Open invoices</Link></Button></CardContent></Card>
      <Card><CardHeader><h2 className="font-semibold">Cash sale</h2></CardHeader><CardContent><p className="mb-4 text-sm text-slate-500">Record merchant-declared cash activity separately from verified payments.</p><RecordCashSaleDrawer /></CardContent></Card>
    </div>
    <Card><CardHeader><h2 className="font-semibold">Receipts and payment status</h2></CardHeader><CardContent><Button asChild variant="secondary"><Link href="/analytics/transactions">Open transactions and receipts</Link></Button></CardContent></Card>
  </div>;
}
