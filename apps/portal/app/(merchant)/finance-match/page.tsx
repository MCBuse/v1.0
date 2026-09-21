"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { SavedMerchantAssessment } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Field, FieldLabel, Input } from "@repo/ui/field";
import { portalApi } from "@/lib/client/api";
import { usePortalResource } from "@/lib/client/use-portal-resource";
import {
  operationIntent,
  finishOperationIntent,
} from "@/lib/client/operation-intent";
import { SavedAssessmentDetail } from "@/components/saved-assessment";
type Package = {
  id: string;
  periodFrom: string;
  periodTo: string;
  createdAt: string;
  assessment: SavedMerchantAssessment | null;
  assessmentBinding: string;
  artifacts?: Array<{ kind: string; sha256: string }>;
};
type Attempt = {
  id: string;
  packageId: string;
  recipientEmail: string;
  status: string;
  createdAt: string;
};
export default function FinanceMatchPage() {
  const profile = usePortalResource<{ id: string }>("me");
  const assessments = usePortalResource<{
    assessments: SavedMerchantAssessment[];
  }>("me/assessments");
  const history = usePortalResource<{ items: Package[] }>(
    "me/finance-packages",
  );
  const emails = usePortalResource<{ items: Attempt[] }>(
    "me/finance-packages/email-attempts",
  );
  const [assessmentId, setAssessmentId] = useState("");
  const [periodDays, setPeriodDays] = useState<7 | 30 | 90>(30);
  const [pkg, setPkg] = useState<Package | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!assessmentId && assessments.data?.assessments.length) {
      const requested = new URLSearchParams(window.location.search).get(
        "assessmentId",
      );
      setAssessmentId(
        assessments.data.assessments.find((a) => a.id === requested)?.id ??
          assessments.data.assessments[0]!.id,
      );
    }
  }, [assessmentId, assessments.data]);
  async function preview(id: string) {
    setError("");
    try {
      setPkg(await portalApi<Package>(`me/finance-packages/${id}/preview`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    }
  }
  async function generate() {
    if (!profile.data || !assessmentId) return;
    setBusy(true);
    setError("");
    try {
      const input = { periodDays, assessmentId };
      const id = operationIntent(profile.data.id, "package", input);
      const result = await portalApi<Package>("me/finance-packages", {
        method: "POST",
        headers: { "Idempotency-Key": id },
        body: JSON.stringify(input),
      });
      await preview(result.id);
      await history.refresh();
      finishOperationIntent(profile.data.id, "package");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pkg || !profile.data) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = {
      recipientEmail: String(data.get("recipientEmail")).trim().toLowerCase(),
      institutionName: String(data.get("institutionName") || "").trim(),
      confirmed: data.get("confirmed") === "on",
    };
    setBusy(true);
    setError("");
    try {
      const key = operationIntent(profile.data.id, "email", {
        packageId: pkg.id,
        ...input,
      });
      const result = await portalApi<{ status: string }>(
        `me/finance-packages/${pkg.id}/email`,
        {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify(input),
        },
      );
      setMessage(
        result.status === "accepted_by_smtp"
          ? "Accepted by the mail server. Inbox delivery has not been confirmed."
          : `Email status: ${result.status.replaceAll("_", " ")}`,
      );
      if (result.status === "accepted_by_smtp") {
        finishOperationIntent(profile.data.id, "email");
        form.reset();
      }
      await emails.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send package");
      await emails.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm text-blue-700">Finance Match</p>
        <h1 className="text-3xl font-semibold">Prepare financial evidence</h1>
        <p className="mt-2 text-sm text-slate-500">
          Choose a saved assessment and reporting period. Preview, download and
          email the same fixed documents.
        </p>
      </div>
      {error ||
      profile.error ||
      assessments.error ||
      history.error ||
      emails.error ? (
        <Alert>
          {error ||
            profile.error?.message ||
            assessments.error?.message ||
            history.error?.message ||
            emails.error?.message}
        </Alert>
      ) : null}
      {message ? <Alert>{message}</Alert> : null}
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Create package</h2>
        </CardHeader>
        <CardContent className="grid gap-4">
          {assessments.data?.assessments.length ? (
            <Field>
              <FieldLabel htmlFor="assessment">Saved assessment</FieldLabel>
              <select
                id="assessment"
                className="rounded border p-2"
                value={assessmentId}
                onChange={(e) => setAssessmentId(e.target.value)}
              >
                {assessments.data.assessments.map((a, index) => (
                  <option key={a.id} value={a.id}>
                    {index === 0 ? "Latest saved · " : ""}
                    {new Date(a.createdAt).toLocaleString()} ·{" "}
                    {a.stage.replaceAll("_", " ")} · {a.id}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p>
              No saved assessment.{" "}
              <Link className="underline" href="/credit-assessment">
                Run an assessment first
              </Link>
              .
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {([7, 30, 90] as const).map((days) => (
              <Button
                key={days}
                variant={periodDays === days ? "primary" : "secondary"}
                onClick={() => setPeriodDays(days)}
              >
                {days} days
              </Button>
            ))}
            <Button
              disabled={busy || !assessmentId || !profile.data}
              onClick={() => void generate()}
            >
              {busy ? "Working…" : "Generate and preview"}
            </Button>
          </div>
        </CardContent>
      </Card>
      {pkg ? (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Package preview</h2>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p>
              Reporting period: {new Date(pkg.periodFrom).toLocaleDateString()}{" "}
              – {new Date(pkg.periodTo).toLocaleDateString()}
            </p>
            {pkg.assessment ? (
              <SavedAssessmentDetail assessment={pkg.assessment} />
            ) : (
              <Alert>
                This legacy package has no verified saved-assessment binding.
                Generate a corrected package above; this original is preserved.
              </Alert>
            )}
            <iframe
              title="Immutable financial evidence PDF"
              src={`/api/merchant/me/finance-packages/${pkg.id}/pdf?preview=true`}
              className="h-[650px] w-full rounded border"
            />
            <div className="flex gap-3">
              <Button asChild variant="secondary">
                <a
                  href={`/api/merchant/me/finance-packages/${pkg.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download PDF
                </a>
              </Button>
              <Button asChild variant="secondary">
                <a href={`/api/merchant/me/finance-packages/${pkg.id}/data`}>
                  Download data
                </a>
              </Button>
            </div>
            <form
              onSubmit={(e) => void send(e)}
              className="grid gap-3 border-t pt-4"
            >
              <Field>
                <FieldLabel htmlFor="recipient">Recipient email</FieldLabel>
                <Input
                  id="recipient"
                  name="recipientEmail"
                  type="email"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="institution">
                  Institution (optional)
                </FieldLabel>
                <Input id="institution" name="institutionName" />
              </Field>
              <label className="text-sm">
                <input name="confirmed" type="checkbox" required /> I confirm I
                am authorised to share this fixed package with this recipient.
              </label>
              <Button disabled={busy}>
                {message ? "Send another copy" : "Send package"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Package history</h2>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2">
            {history.data?.items.map((p) => (
              <li key={p.id}>
                <Button variant="secondary" onClick={() => void preview(p.id)}>
                  {new Date(p.createdAt).toLocaleString()} ·{" "}
                  {p.assessmentBinding === "verified"
                    ? "Saved assessment"
                    : "Legacy package"}
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Email history</h2>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm">
            {emails.data?.items.map((a) => (
              <li key={a.id}>
                {new Date(a.createdAt).toLocaleString()} · {a.recipientEmail} ·{" "}
                {a.status.replaceAll("_", " ")} · Package {a.packageId}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-500">
            Mail-server acceptance is not confirmation of inbox delivery.
            Unknown delivery outcomes are not resent automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
