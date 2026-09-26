"use client";

import type { MerchantPayout } from "@repo/shared";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { EmptyState, ErrorState } from "@repo/ui/empty-state";
import { usePortalResource } from "@/lib/client/use-portal-resource";
import { MerchantImportDrawer } from "@/components/merchant-import-drawer";

export default function ReconciliationPage() {
  const data = usePortalResource<{ coverage: boolean; items: MerchantPayout[] }>("me/reconciliation");
  if (!data.data && data.loading) return <div className="p-6 text-sm text-slate-500">Loading reconciliation…</div>;
  if (!data.data) return <ErrorState retry={<Button onClick={() => void data.refresh()}>Try again</Button>} />;
  return <div className="grid gap-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight text-slate-950">Payment-to-payout reconciliation</h1><p className="mt-2 text-sm text-slate-500">Imported settlement evidence is separate from customer payment status.</p></div><MerchantImportDrawer kind="settlement" label="Import settlements" onCommitted={() => void data.refresh()} /></div>{!data.data.coverage ? <EmptyState title="No payout evidence available" description="Import settlement records with stable references and payment allocations to assess payout coverage." /> : <Card><CardHeader><h2 className="font-semibold">Imported payouts</h2></CardHeader><CardContent className="grid gap-3">{data.data.items.map((item) => <div key={item.id} className="flex items-center justify-between border-b border-slate-100 py-3 text-sm"><div><p className="font-medium">{item.externalReference}</p><p className="text-slate-500">{item.sourceName} · {item.currency}</p>{item.expectedAmountMinor !== null && item.actualAmountMinor !== null ? <p className="mt-1 text-xs text-slate-500">Expected {formatMinor(item.expectedAmountMinor, item.currency)} · received {formatMinor(item.actualAmountMinor, item.currency)}{item.expectedAmountMinor !== item.actualAmountMinor ? ` · ${formatDifference(item.expectedAmountMinor, item.actualAmountMinor, item.currency)}` : ""}</p> : null}</div><div className="grid justify-items-end gap-1"><Badge tone={item.payoutStatus === "settled" ? "success" : item.payoutStatus === "delayed" || item.payoutStatus === "missing" ? "danger" : "neutral"}>{item.payoutStatus}</Badge><Badge tone={item.reconciliationStatus === "matched" ? "success" : item.reconciliationStatus === "difference" ? "danger" : "neutral"}>{item.reconciliationStatus}</Badge></div></div>)}</CardContent></Card>}</div>;
}
function formatMinor(value: string, currency: string) { return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(Number(BigInt(value)) / 100); }
function formatDifference(expected: string, actual: string, currency: string) { const difference = BigInt(expected) - BigInt(actual); return difference > 0n ? `${formatMinor(difference.toString(), currency)} shortfall` : `${formatMinor((-difference).toString(), currency)} over expected`; }
