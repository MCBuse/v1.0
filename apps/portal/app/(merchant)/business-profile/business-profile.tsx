"use client";

import type {
  MerchantConsent,
  MerchantProfile,
  MerchantReadiness,
} from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Field, FieldLabel, Input } from "@repo/ui/field";
import { ErrorState } from "@repo/ui/empty-state";
import { Skeleton } from "@repo/ui/skeleton";
import { CheckCircle2, Circle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { portalApi } from "@/lib/client/api";
import { usePortalResource } from "@/lib/client/use-portal-resource";

const stageCopy: Record<
  MerchantReadiness["stage"],
  {
    label: string;
    tone: "danger" | "neutral" | "info" | "success";
    detail: string;
  }
> = {
  integrity_review: {
    label: "Integrity review",
    tone: "danger",
    detail:
      "A critical capture issue must be resolved before the history can be assessed.",
  },
  insufficient_evidence: {
    label: "Insufficient evidence",
    tone: "neutral",
    detail: "Keep receiving payments to establish a useful observation period.",
  },
  building_history: {
    label: "Building history",
    tone: "info",
    detail:
      "Your records are useful and still progressing toward the documented evidence threshold.",
  },
  evidence_ready: {
    label: "Evidence ready",
    tone: "success",
    detail:
      "Your observed history meets the current evidence-completeness requirements.",
  },
};

export function BusinessProfile() {
  const profile = usePortalResource<MerchantProfile>("me");
  const readiness = usePortalResource<MerchantReadiness>(
    "me/evidence-readiness",
  );
  const consent = usePortalResource<MerchantConsent>("me/consents");
  const imports = usePortalResource<{ items: Array<{ id: string; kind: string; sourceName: string; status: string; committedAt: string | null; createdAt: string }> }>("me/imports");
  const [saving, setSaving] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [profileError, setProfileError] = useState("");
  if (
    (profile.loading && !profile.data) ||
    (readiness.loading && !readiness.data)
  )
    return <Skeleton className="h-[34rem]" />;
  if (!profile.data || !readiness.data)
    return (
      <ErrorState
        retry={
          <Button
            onClick={() => {
              void profile.refresh();
              void readiness.refresh();
            }}
          >
            Try again
          </Button>
        }
      />
    );
  const stage = stageCopy[readiness.data.stage];
  async function changeConsent(active: boolean) {
    setSaving(true);
    setConsentError("");
    try {
      await portalApi<MerchantConsent>("me/consents", {
        method: "POST",
        body: JSON.stringify({ active }),
      });
      await consent.refresh();
      await readiness.refresh();
    } catch (reason) {
      setConsentError(
        reason instanceof Error
          ? reason.message
          : "Consent could not be updated",
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setProfileError(""); const form = new FormData(event.currentTarget);
    try { await portalApi<MerchantProfile>("me", { method: "PATCH", body: JSON.stringify({ businessName: String(form.get("businessName") ?? "").trim(), timezone: String(form.get("timezone") ?? "").trim() }) }); await profile.refresh(); } catch (reason) { setProfileError(reason instanceof Error ? reason.message : "Business profile could not be updated."); } finally { setSaving(false); }
  }
  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Business profile</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          {profile.data.businessName}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Your payment-history readiness and consent controls.
        </p>
      </div>
      <div className="grid gap-6 2xl:grid-cols-[1.2fr_.8fr]">
        <Card>
          <CardHeader>
            <div>
              <p className="text-sm text-slate-500">Assessment readiness</p>
              <div className="mt-2 flex items-center gap-3">
                <h2 className="text-2xl font-semibold text-slate-950">
                  {stage.label}
                </h2>
                <Badge tone={stage.tone}>
                  {readiness.data.stage.replaceAll("_", " ")}
                </Badge>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                {stage.detail}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {[
                ...readiness.data.passedRequirements.map((label) => ({
                  label,
                  passed: true,
                })),
                ...readiness.data.missingRequirements.map((label) => ({
                  label,
                  passed: false,
                })),
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-start gap-3 border-t border-slate-100 py-3 first:border-0"
                >
                  {item.passed ? (
                    <CheckCircle2
                      className="mt-0.5 text-emerald-600"
                      size={18}
                    />
                  ) : (
                    <Circle className="mt-0.5 text-slate-300" size={18} />
                  )}
                  <span
                    className={`text-sm ${item.passed ? "text-slate-700" : "text-slate-500"}`}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
            <Alert className="mt-5 border-blue-200 bg-blue-50 text-blue-900">
              {readiness.data.disclaimer}
            </Alert>
          </CardContent>
        </Card>
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader><div><h2 className="font-semibold text-slate-950">Business settings</h2><p className="mt-1 text-sm text-slate-500">Account details and local reporting time.</p></div></CardHeader>
            <CardContent><form className="grid gap-4" onSubmit={(event) => void saveProfile(event)}>{profileError ? <Alert className="border-red-200 bg-red-50 text-red-800">{profileError}</Alert> : null}<Field><FieldLabel htmlFor="business-name">Business name</FieldLabel><Input id="business-name" name="businessName" defaultValue={profile.data.businessName} maxLength={160} required/></Field><Field><FieldLabel htmlFor="business-timezone">Timezone</FieldLabel><Input id="business-timezone" name="timezone" defaultValue={profile.data.timezone} maxLength={64} required/></Field><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button></form></CardContent>
          </Card>
          <Card><CardHeader><div><h2 className="font-semibold text-slate-950">Imported sources</h2><p className="mt-1 text-sm text-slate-500">File provenance is retained as imported evidence, not provider verification.</p></div></CardHeader><CardContent className="grid gap-3">{imports.data?.items.length ? imports.data.items.slice(0, 8).map((item) => <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-3 first:border-0 first:pt-0" key={item.id}><div><p className="text-sm font-medium text-slate-800">{item.sourceName}</p><p className="text-xs text-slate-500">{item.kind} · {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(item.createdAt))}</p></div><Badge tone={item.status === "committed" ? "success" : "neutral"}>{item.status}</Badge></div>) : <p className="text-sm text-slate-500">No external files imported yet.</p>}</CardContent></Card>
          <Card>
            <CardHeader>
              <div>
                <h2 className="font-semibold text-slate-950">
                  Measured inputs
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Calculated from finalized records.
                </p>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {[
                ["Observed days", readiness.data.measured.observedDays],
                ["Active days", readiness.data.measured.activeDays],
                [
                  "Finalized payments",
                  readiness.data.measured.finalizedPayments,
                ],
                [
                  "Capture quality",
                  `${readiness.data.measured.captureQualityPercent}%`,
                ],
                ["Finality", `${readiness.data.measured.finalityPercent}%`],
              ].map(([label, value]) => (
                <div key={label} className="border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 font-mono text-lg font-medium text-slate-950">
                    {value}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex gap-3">
                <ShieldCheck className="text-blue-700" size={22} />
                <div>
                  <h2 className="font-semibold text-slate-950">
                    Evidence consent
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Allow MCBuse to use your business payment history for
                    evidence-readiness assessment.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {consentError ? (
                <Alert className="mb-4 border-red-200 bg-red-50 text-red-800">
                  {consentError}
                </Alert>
              ) : null}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Badge tone={consent.data?.active ? "success" : "neutral"}>
                    {consent.data?.active ? "Active" : "Not active"}
                  </Badge>
                  {consent.data?.recordedAt ? (
                    <p className="mt-2 text-xs text-slate-400">
                      Last changed{" "}
                      {new Intl.DateTimeFormat("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(consent.data.recordedAt))}
                    </p>
                  ) : null}
                </div>
                <Button
                  variant={consent.data?.active ? "secondary" : "primary"}
                  disabled={saving || consent.loading}
                  onClick={() => void changeConsent(!consent.data?.active)}
                >
                  {saving
                    ? "Saving…"
                    : consent.data?.active
                      ? "Withdraw"
                      : "Give consent"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
