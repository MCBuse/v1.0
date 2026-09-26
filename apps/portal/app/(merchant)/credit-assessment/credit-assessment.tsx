"use client";

import { useState } from "react";
import Link from "next/link";
import type { MerchantProfile, SavedMerchantAssessment } from "@repo/shared";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Alert } from "@repo/ui/alert";
import { usePortalResource } from "@/lib/client/use-portal-resource";
import {
  RunAssessmentDrawer,
  type AssessmentOutcome,
} from "@/components/run-assessment-drawer";
import { SavedAssessmentDetail } from "@/components/saved-assessment";
import { stageLabel } from "@/components/assessment-labels";

type SavedPdf = {
  id: string;
  assessment: SavedMerchantAssessment | null;
  createdAt: string;
};

export function CreditAssessment() {
  const profile = usePortalResource<MerchantProfile>("me");
  const history = usePortalResource<{ assessments: SavedMerchantAssessment[] }>(
    "me/assessments",
  );
  const pdfs = usePortalResource<{ items: SavedPdf[] }>("me/finance-packages");
  const [selected, setSelected] = useState<SavedMerchantAssessment | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  async function completed({ assessment, pdfError }: AssessmentOutcome) {
    setSelected(assessment);
    setError(
      pdfError
        ? `Assessment saved. Its PDF could not be created: ${pdfError}`
        : "",
    );
    setNotice(pdfError ? "" : "Assessment saved and its PDF created.");
    await Promise.all([history.refresh(), pdfs.refresh()]);
  }

  const current = selected ?? history.data?.assessments[0];
  const recent = history.data?.assessments.slice(0, 10) ?? [];
  const packageFor = (assessmentId: string) =>
    pdfs.data?.items.find((item) => item.assessment?.id === assessmentId);

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Credit Assessment</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Business assessment
        </h1>
        <p className="mt-2 max-w-prose text-sm text-slate-600">
          Check your business details, add anything that&apos;s missing, and get
          a dated credit assessment report as a PDF.
        </p>
      </div>

      {error || history.error || profile.error || pdfs.error ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          {error ||
            history.error?.message ||
            profile.error?.message ||
            pdfs.error?.message}
        </Alert>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm font-medium text-emerald-700">
          {notice}
        </p>
      ) : null}

      <div>
        <RunAssessmentDrawer
          merchantId={profile.data?.id}
          onCompleted={completed}
          open={formOpen}
          onOpenChange={setFormOpen}
        />
      </div>

      <Card>
        {current ? (
          <CardContent className="py-6">
            <SavedAssessmentDetail
              assessment={current}
              title={
                selected && selected.id !== history.data?.assessments[0]?.id
                  ? "Selected assessment"
                  : "Latest assessment"
              }
              titleAs="h2"
              onAddInformation={
                profile.data ? () => setFormOpen(true) : undefined
              }
            />
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <h2 className="font-semibold text-slate-950">
                Latest assessment
              </h2>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">
                {history.loading
                  ? "Loading assessments…"
                  : "No assessment yet. Select Run credit assessment to get started."}
              </p>
            </CardContent>
          </>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div>
            <h2 className="font-semibold text-slate-950">
              Recent credit assessments
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Your past assessments and their PDF reports.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {history.loading && !history.data ? (
            <p className="text-sm text-slate-600">
              Loading recent assessments…
            </p>
          ) : recent.length ? (
            <ul className="divide-y divide-slate-100">
              {recent.map((assessment) => {
                const pdf = packageFor(assessment.id);
                return (
                  <li
                    key={assessment.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
                  >
                    <button
                      type="button"
                      className="min-h-11 text-left text-sm font-medium text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-700"
                      onClick={() => setSelected(assessment)}
                    >
                      {new Date(assessment.createdAt).toLocaleString()} ·{" "}
                      {stageLabel(assessment.stage)}
                    </button>
                    {pdf ? (
                      <span className="inline-flex gap-4">
                        <a
                          className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-700"
                          href={`/api/merchant/me/finance-packages/${pdf.id}/pdf?preview=true`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View PDF
                        </a>
                        <a
                          className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-700"
                          href={`/api/merchant/me/finance-packages/${pdf.id}/pdf`}
                          download
                        >
                          Download
                        </a>
                      </span>
                    ) : (
                      <Link
                        className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700"
                        href={`/finance-match?assessmentId=${assessment.id}`}
                      >
                        Prepare PDF
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">No saved assessments yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
