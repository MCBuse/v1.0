"use client";

import { useState } from "react";
import Link from "next/link";
import type { MerchantConsent, MerchantProfile, SavedMerchantAssessment } from "@repo/shared";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Alert } from "@repo/ui/alert";
import { usePortalResource } from "@/lib/client/use-portal-resource";
import { portalApi } from "@/lib/client/api";
import { operationIntent, finishOperationIntent } from "@/lib/client/operation-intent";
import { CreditProfileForm } from "@/components/credit-profile-form";
import { SavedAssessmentDetail } from "@/components/saved-assessment";
import { stageLabel } from "@/components/assessment-labels";

type SavedPdf = {
  id: string;
  assessment: SavedMerchantAssessment | null;
  createdAt: string;
};

export function CreditAssessment() {
  const profile = usePortalResource<MerchantProfile>("me");
  const history = usePortalResource<{ assessments: SavedMerchantAssessment[] }>("me/assessments");
  const pdfs = usePortalResource<{ items: SavedPdf[] }>("me/finance-packages");
  const evidenceConsent = usePortalResource<MerchantConsent>("me/consents");
  const [selected, setSelected] = useState<SavedMerchantAssessment | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function changeEvidenceConsent() {
    if (!evidenceConsent.data) return;
    setConsentBusy(true);
    setError("");
    try {
      await portalApi("me/consents", {
        method: "POST",
        body: JSON.stringify({ active: !evidenceConsent.data.active }),
      });
      await evidenceConsent.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Evidence consent could not be updated.");
    } finally {
      setConsentBusy(false);
    }
  }

  async function run() {
    if (!profile.data || formDirty) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const input = { modelId: "george-financial-profile-v1" };
      const key = operationIntent(profile.data.id, "assessment", input);
      const result = await portalApi<SavedMerchantAssessment>("me/assessments", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify(input),
      });
      setSelected(result);
      finishOperationIntent(profile.data.id, "assessment");
      await history.refresh();

      try {
        const packageInput = { periodDays: 30, assessmentId: result.id };
        const packageKey = operationIntent(profile.data.id, "package", packageInput);
        await portalApi<SavedPdf>("me/finance-packages", {
          method: "POST",
          headers: { "Idempotency-Key": packageKey },
          body: JSON.stringify(packageInput),
        });
        finishOperationIntent(profile.data.id, "package");
        await pdfs.refresh();
        setNotice("Assessment and financial evidence PDF saved.");
      } catch (pdfError) {
        setError(`Assessment saved. The PDF could not be prepared: ${pdfError instanceof Error ? pdfError.message : "please try Finance Match."}`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save assessment");
    } finally {
      setBusy(false);
    }
  }

  const current = selected ?? history.data?.assessments[0];
  const recent = history.data?.assessments.slice(0, 10) ?? [];
  const packageFor = (assessmentId: string) => pdfs.data?.items.find((item) => item.assessment?.id === assessmentId);

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Credit Assessment</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Business assessment</h1>
        <p className="mt-2 max-w-prose text-sm text-slate-600">
          Check your business details, add anything that&apos;s missing, and get a dated credit assessment report as a PDF.
        </p>
      </div>

      {error || history.error || profile.error || pdfs.error || evidenceConsent.error ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          {error || history.error?.message || profile.error?.message || pdfs.error?.message || evidenceConsent.error?.message}
        </Alert>
      ) : null}
      {notice ? <p role="status" className="text-sm font-medium text-emerald-700">{notice}</p> : null}

      <div>
        <Button aria-expanded={formOpen} aria-controls="assessment-form" onClick={() => { if (formOpen) setFormDirty(false); setFormOpen((open) => !open); }}>
          {formOpen ? "Close assessment form" : "Run credit assessment"}
        </Button>
      </div>

      {formOpen ? (
        <section id="assessment-form" className="grid gap-4" aria-label="Assessment form">
          <Card>
            <CardHeader><h2 className="font-semibold text-slate-950">Business details on record</h2></CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <div><p className="text-slate-600">Business name</p><p className="mt-1 font-medium text-slate-950">{profile.loading && !profile.data ? "Loading…" : profile.data?.businessName ?? "Not available"}</p></div>
              <div><p className="text-slate-600">Reporting currency</p><p className="mt-1 font-medium text-slate-950">{profile.loading && !profile.data ? "Loading…" : profile.data?.displayCurrency ?? "Not available"}</p></div>
              <p className="sm:col-span-2 text-xs text-slate-600">Payment and inventory records are added from your saved business activity when the assessment runs.</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div>
                <h2 className="font-semibold text-slate-950">Evidence consent</h2>
                <p className="mt-1 max-w-prose text-sm text-slate-600">Allow MCBuse to use saved business records in this assessment. You can withdraw consent here.</p>
                <p className="mt-2 text-sm font-medium text-slate-950">Status: {evidenceConsent.loading && !evidenceConsent.data ? "Loading…" : evidenceConsent.data?.active ? "Active" : "Not active"}</p>
              </div>
              <Button variant="secondary" disabled={consentBusy || !evidenceConsent.data} onClick={() => void changeEvidenceConsent()}>
                {consentBusy ? "Saving…" : evidenceConsent.data?.active ? "Withdraw consent" : "Give consent"}
              </Button>
            </CardContent>
          </Card>
          <CreditProfileForm onDirtyChange={setFormDirty} />
          <Card>
            <CardContent className="grid gap-3 py-5">
              <h2 className="font-semibold text-slate-950">Generate assessment and PDF</h2>
              <p className="text-sm text-slate-600">The PDF includes your credit profile result, any information still missing, the details you added, and a summary of your last 30 days of activity.</p>
              {formDirty ? <p className="text-sm text-amber-800">Save additional information above before generating.</p> : null}
              <div><Button disabled={busy || !profile.data || formDirty} aria-busy={busy} onClick={() => void run()}>{busy ? "Generating…" : "Generate assessment PDF"}</Button></div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <Card>
        <CardHeader><h2 className="font-semibold text-slate-950">Latest assessment</h2></CardHeader>
        <CardContent>
          {current ? <SavedAssessmentDetail assessment={current} /> : (
            <p className="text-sm text-slate-600">{history.loading ? "Loading assessments…" : "No assessment yet. Select Run credit assessment to get started."}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><h2 className="font-semibold text-slate-950">Recent credit assessments</h2><p className="mt-1 text-sm text-slate-600">Your past assessments and their PDF reports.</p></div></CardHeader>
        <CardContent>
          {history.loading && !history.data ? <p className="text-sm text-slate-600">Loading recent assessments…</p> : recent.length ? (
            <ul className="divide-y divide-slate-100">
              {recent.map((assessment) => {
                const pdf = packageFor(assessment.id);
                return (
                  <li key={assessment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                    <button type="button" className="min-h-11 text-left text-sm font-medium text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-700" onClick={() => setSelected(assessment)}>
                      {new Date(assessment.createdAt).toLocaleString()} · {stageLabel(assessment.stage)}
                    </button>
                    {pdf ? <a className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-700" href={`/api/merchant/me/finance-packages/${pdf.id}/pdf`} target="_blank" rel="noreferrer">Download PDF</a> : <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700" href={`/finance-match?assessmentId=${assessment.id}`}>Prepare PDF</Link>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-slate-600">No saved assessments yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
