"use client";

import type { MerchantAnalytics, MerchantReadiness } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Button } from "@repo/ui/button";
import { Money } from "@repo/ui/money";
import Link from "next/link";
import { usePortalResource } from "@/lib/client/use-portal-resource";

type Assessment = { modelId: string; modelVersion: string; assessedAt: string; stage: string; readiness: MerchantReadiness; businessActivity: MerchantAnalytics; paymentReliability: { finalizedPayments: number; finalityPercent: number; captureQualityPercent: number }; evidenceSources: Record<string, number>; payoutReconciliation: { coverage: boolean; items: unknown[] }; limitations: string[] };

export function CreditAssessment() {
  const assessment = usePortalResource<Assessment>("me/credit-assessment");
  const data = assessment.data;
  return <div className="grid gap-6">
    <div><p className="text-sm font-medium text-blue-700">Credit Assessment</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Evidence readiness</h1><p className="mt-2 text-sm text-slate-500">A versioned demonstration of evidence completeness, not a credit score or lending decision.</p></div>
    <Card><CardHeader><h2 className="text-xl font-semibold">{data?.stage?.replaceAll("_", " ") ?? "Loading assessment"}</h2></CardHeader><CardContent className="grid gap-4"><p className="text-sm text-slate-500">Model: {data?.modelVersion ?? "readiness-rules-v1"}. Cash records and imported payout records do not change finalized-payment or finality measures.</p>{data?.readiness.missingRequirements.map((item) => <p key={item} className="text-sm text-slate-600">• {item}</p>)}<Alert className="border-blue-200 bg-blue-50 text-blue-900">{data?.readiness.disclaimer ?? "Evidence readiness is not a credit score, lending decision, approval or denial."}</Alert></CardContent></Card>
    {data ? <div className="grid gap-4 md:grid-cols-3"><Metric label="Recorded 30-day sales" value={<Money value={data.businessActivity.totalRecordedSales} />}/><Metric label="Finalized payments" value={data.paymentReliability.finalizedPayments}/><Metric label="Capture / finality" value={`${data.paymentReliability.captureQualityPercent}% / ${data.paymentReliability.finalityPercent}%`}/></div> : null}
    <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><h2 className="font-semibold">Payment-to-payout reconciliation</h2></CardHeader><CardContent><p className="mb-3 text-sm text-slate-500">{data?.payoutReconciliation.coverage ? `${data.payoutReconciliation.items.length} imported payout record(s)` : "No payout evidence available"}</p><Button asChild variant="secondary"><Link href="/credit-assessment/reconciliation">View reconciliation</Link></Button></CardContent></Card><Card><CardHeader><h2 className="font-semibold">Business profile and consent</h2></CardHeader><CardContent><Button asChild variant="secondary"><Link href="/credit-assessment/business-profile">Open profile</Link></Button></CardContent></Card></div>
  </div>;
}
function Metric({ label, value }: { label: string; value: React.ReactNode }) { return <Card><CardContent className="pt-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p></CardContent></Card>; }
