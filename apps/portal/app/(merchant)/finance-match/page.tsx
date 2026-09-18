"use client";

import { useState } from "react";
import { Alert } from "@repo/ui/alert";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Field, FieldLabel, Input } from "@repo/ui/field";
import { portalApi } from "@/lib/client/api";

type Package = { id: string; periodFrom: string; periodTo: string; snapshot: { businessName: string; readiness: { stage: string } } };

export default function FinanceMatchPage() {
  const [pkg, setPkg] = useState<Package | null>(null);
  const [periodDays, setPeriodDays] = useState<7 | 30 | 90>(30);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  async function generate() {
    setWorking(true); setError("");
    try { setPkg(await portalApi<Package>("me/finance-packages", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ periodDays }) })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not generate package."); }
    finally { setWorking(false); }
  }
  function download(kind: "pdf" | "data") { if (pkg) window.open(`/api/merchant/me/finance-packages/${pkg.id}/${kind}`, "_blank", "noopener,noreferrer"); }
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!pkg) return; setWorking(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await portalApi<{ status: string }>(`me/finance-packages/${pkg.id}/email`, {
        method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ recipientEmail: String(form.get("recipientEmail")), institutionName: String(form.get("institutionName") || ""), confirmed: form.get("confirmed") === "on" }),
      });
      setMessage(result.status === "accepted_by_smtp" ? "Email accepted by SMTP. This does not confirm inbox delivery." : `Email status: ${result.status}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send package."); }
    finally { setWorking(false); }
  }
  return <div className="grid gap-6">
    <div><p className="text-sm font-medium text-blue-700">Finance Match</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Prepare financial evidence</h1><p className="mt-2 text-sm text-slate-500">Generate a fixed evidence package, then download or send the same snapshot.</p></div>
    {error ? <Alert className="border-red-200 bg-red-50 text-red-800">{error}</Alert> : null}
    {message ? <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">{message}</Alert> : null}
    <Card><CardHeader><h2 className="font-semibold">Financial evidence package</h2></CardHeader><CardContent className="grid gap-4">
      <p className="text-sm text-slate-500">Includes recorded sales, source labels, evidence readiness and reconciliation coverage. It is not a credit decision.</p>
      <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-slate-600">Reporting period</span>{([7, 30, 90] as const).map((days) => <Button key={days} size="sm" variant={periodDays === days ? "primary" : "secondary"} disabled={working} onClick={() => setPeriodDays(days)}>{days} days</Button>)}<Button onClick={() => void generate()} disabled={working}>{working ? "Generating…" : `Preview ${periodDays}-day package`}</Button></div>
      {pkg ? <div className="grid gap-4 rounded-lg border border-slate-200 p-4">
        <div className="text-sm"><p className="font-medium">{pkg.snapshot.businessName}</p><p className="text-slate-500">{new Date(pkg.periodFrom).toLocaleDateString()} – {new Date(pkg.periodTo).toLocaleDateString()} · {pkg.snapshot.readiness.stage.replaceAll("_", " ")}</p></div>
        <div className="flex flex-wrap gap-3"><Button variant="secondary" onClick={() => download("pdf")}>Download PDF</Button><Button variant="secondary" onClick={() => download("data")}>Download data</Button></div>
        <form className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2" onSubmit={(event) => void send(event)}>
          <Field><FieldLabel htmlFor="recipient">Recipient email</FieldLabel><Input id="recipient" name="recipientEmail" type="email" required /></Field>
          <Field><FieldLabel htmlFor="institution">Institution name (optional)</FieldLabel><Input id="institution" name="institutionName" maxLength={160}/></Field>
          <label className="flex items-start gap-2 text-xs text-slate-600 sm:col-span-2"><input name="confirmed" type="checkbox" required className="mt-0.5"/>I confirm I am authorised to share this fixed package with this recipient.</label>
          <div className="sm:col-span-2"><Button type="submit" disabled={working}>Send package</Button></div>
        </form>
      </div> : null}
    </CardContent></Card>
  </div>;
}
