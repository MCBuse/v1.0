"use client";
import { useState } from "react";
import Link from "next/link";
import type { SavedMerchantAssessment } from "@repo/shared";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Alert } from "@repo/ui/alert";
import { usePortalResource } from "@/lib/client/use-portal-resource";
import { portalApi } from "@/lib/client/api";
import {
  operationIntent,
  finishOperationIntent,
} from "@/lib/client/operation-intent";
import { SavedAssessmentDetail } from "@/components/saved-assessment";
export function CreditAssessment() {
  const profile = usePortalResource<{ id: string }>("me");
  const history = usePortalResource<{ assessments: SavedMerchantAssessment[] }>(
    "me/assessments",
  );
  const [selected, setSelected] = useState<SavedMerchantAssessment | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    if (!profile.data) return;
    setBusy(true);
    setError("");
    try {
      const input = { modelId: "readiness-rules-v1" };
      const key = operationIntent(profile.data.id, "assessment", input);
      const result = await portalApi<SavedMerchantAssessment>(
        "me/assessments",
        {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify(input),
        },
      );
      setSelected(result);
      await history.refresh();
      finishOperationIntent(profile.data.id, "assessment");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save assessment");
    } finally {
      setBusy(false);
    }
  }
  const current = selected ?? history.data?.assessments[0];
  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm text-blue-700">Credit Assessment</p>
        <h1 className="text-3xl font-semibold">Evidence readiness</h1>
        <p className="mt-2 text-sm text-slate-500">
          Save a dated assessment of your evidence. This is not a credit score
          or lending decision.
        </p>
      </div>
      {error || history.error || profile.error ? (
        <Alert>
          {error || history.error?.message || profile.error?.message}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy || !profile.data} onClick={() => void run()}>
          {busy ? "Saving assessment…" : "Run assessment"}
        </Button>
        <Button asChild variant="secondary">
          <Link href="/credit-assessment/business-profile">
            Business profile and consent
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/credit-assessment/reconciliation">Reconciliation</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Saved assessment</h2>
        </CardHeader>
        <CardContent>
          {current ? (
            <SavedAssessmentDetail assessment={current} />
          ) : (
            <p>
              {history.loading
                ? "Loading…"
                : "No saved assessment yet. Run your first assessment above."}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Assessment history</h2>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2">
            {history.data?.assessments.map((a) => (
              <li key={a.id}>
                <Button variant="secondary" onClick={() => setSelected(a)}>
                  {new Date(a.createdAt).toLocaleString()} ·{" "}
                  {a.stage.replaceAll("_", " ")}
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {current ? (
        <Button asChild>
          <Link href={`/finance-match?assessmentId=${current.id}`}>
            Prepare package from this assessment
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
