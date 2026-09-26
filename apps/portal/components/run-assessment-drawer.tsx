"use client";

import { useState } from "react";
import type {
  CreditInputPreview,
  CreditProfile,
  MerchantConsent,
  SavedMerchantAssessment,
} from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Button } from "@repo/ui/button";
import { X } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { portalApi } from "@/lib/client/api";
import { usePortalResource } from "@/lib/client/use-portal-resource";
import {
  finishOperationIntent,
  operationIntent,
} from "@/lib/client/operation-intent";
import { fieldLabel, inputValue } from "@/components/assessment-labels";
import {
  CreditProfileFields,
  readCreditProfile,
  sameCreditProfile,
} from "@/components/credit-profile-form";

export type AssessmentOutcome = {
  assessment: SavedMerchantAssessment;
  /** Set when the assessment saved but its PDF could not be created. */
  pdfError: string | null;
};

const MODEL_INPUT = { modelId: "george-financial-profile-v1" } as const;
const FORM_ID = "run-assessment-form";

/**
 * One action, one form: the parameters derived from business activity, the
 * merchant's Additional Information, and a single "Run assessment" that saves
 * any changed declarations, runs the assessment and creates its PDF.
 */
export function RunAssessmentDrawer({
  merchantId,
  onCompleted,
}: {
  merchantId: string | undefined;
  onCompleted: (outcome: AssessmentOutcome) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Drawer direction="right" open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button disabled={!merchantId}>Run credit assessment</Button>
      </DrawerTrigger>
      <DrawerContent className="h-dvh w-full overflow-hidden rounded-none sm:min-w-4xl">
        <DrawerHeader className="relative border-b border-slate-200 pr-16">
          <DrawerTitle>Run credit assessment</DrawerTitle>
          <DrawerDescription>
            Review what your records show, add anything missing, then run the
            assessment. The result and its PDF are saved together.
          </DrawerDescription>
          <DrawerClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close assessment form"
              className="absolute right-3 top-3"
            >
              <X />
            </Button>
          </DrawerClose>
        </DrawerHeader>
        {open && merchantId ? (
          <AssessmentForm
            merchantId={merchantId}
            onDone={async (outcome) => {
              await onCompleted(outcome);
              setOpen(false);
            }}
          />
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

function AssessmentForm({
  merchantId,
  onDone,
}: {
  merchantId: string;
  onDone: (outcome: AssessmentOutcome) => Promise<void>;
}) {
  const inputs = usePortalResource<CreditInputPreview>("me/credit-inputs");
  const profile = usePortalResource<CreditProfile>("me/credit-profile");
  const consent = usePortalResource<MerchantConsent>("me/consents");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");

  const consentActive = consent.data?.active === true;
  const canRun =
    !busy && !!profile.data && !!consent.data && (consentActive || agreed);

  async function withdrawConsent() {
    setError("");
    try {
      await portalApi("me/consents", {
        method: "POST",
        body: JSON.stringify({ active: false }),
      });
      setAgreed(false);
      await consent.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Consent could not be withdrawn.",
      );
    }
  }

  async function run(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile.data || !canRun) return;
    setError("");
    let declared: CreditProfile;
    try {
      declared = readCreditProfile(new FormData(event.currentTarget));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Check the amounts entered.",
      );
      return;
    }
    setBusy(true);
    try {
      if (!sameCreditProfile(declared, profile.data)) {
        setStep("Saving additional information…");
        await portalApi("me/credit-profile", {
          method: "PATCH",
          body: JSON.stringify({ data: declared }),
        });
      }
      if (!consentActive) {
        setStep("Recording consent…");
        await portalApi("me/consents", {
          method: "POST",
          body: JSON.stringify({ active: true }),
        });
      }
      setStep("Running assessment…");
      // Declarations are part of the fingerprint, so changed information is
      // never answered with a replay of an earlier run.
      const key = operationIntent(merchantId, "assessment", {
        ...MODEL_INPUT,
        declared,
      });
      const assessment = await portalApi<SavedMerchantAssessment>(
        "me/assessments",
        {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify(MODEL_INPUT),
        },
      );
      finishOperationIntent(merchantId, "assessment");

      let pdfError: string | null = null;
      try {
        setStep("Creating the PDF…");
        const packageInput = { periodDays: 30, assessmentId: assessment.id };
        await portalApi("me/finance-packages", {
          method: "POST",
          headers: {
            "Idempotency-Key": operationIntent(
              merchantId,
              "package",
              packageInput,
            ),
          },
          body: JSON.stringify(packageInput),
        });
        finishOperationIntent(merchantId, "package");
      } catch (reason) {
        pdfError =
          reason instanceof Error
            ? reason.message
            : "The PDF could not be created.";
      }
      await onDone({ assessment, pdfError });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The assessment could not be run.",
      );
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  const available =
    inputs.data?.inputs.filter((item) => item.value !== null).length ?? 0;
  const total = inputs.data?.inputs.length ?? 0;

  return (
    <>
      <form
        id={FORM_ID}
        onSubmit={(event) => void run(event)}
        className="grid flex-1 content-start gap-8 overflow-y-auto p-6"
      >
        <section aria-labelledby="assessment-derived" className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3
              id="assessment-derived"
              className="font-semibold text-slate-950"
            >
              From your business activity
            </h3>
            {inputs.data ? (
              <span className="text-xs text-slate-500">
                {available} of {total} available
              </span>
            ) : null}
          </div>
          {inputs.data ? (
            <>
              <p className="text-sm text-slate-600">
                Calculated from your MCBuse payments and recorded cash sales for{" "}
                {DATE.format(new Date(inputs.data.evidenceWindow.from))} –{" "}
                {DATE.format(new Date(inputs.data.evidenceWindow.to))}. These
                can&apos;t be edited. Anything unavailable stays missing and is
                never estimated.
              </p>
              <dl className="grid gap-x-6 gap-y-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-2">
                {inputs.data.inputs.map((item) => (
                  <div key={item.key} className="min-w-0">
                    <dt className="text-xs text-slate-500">
                      {fieldLabel(item.key)}
                    </dt>
                    <dd
                      className={
                        item.value === null
                          ? "mt-0.5 text-sm text-slate-500"
                          : "mt-0.5 font-mono text-sm tabular-nums text-slate-950"
                      }
                    >
                      {inputValue(item.key, item.value)}
                    </dd>
                    {item.missingReason ? (
                      <dd className="mt-0.5 text-xs text-slate-500">
                        {item.missingReason}
                      </dd>
                    ) : null}
                  </div>
                ))}
              </dl>
              {inputs.data.integritySummary.length ? (
                <details className="text-sm text-slate-600">
                  <summary className="cursor-pointer font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-700">
                    Which records were used
                  </summary>
                  <ul className="mt-2 grid list-disc gap-1 pl-5">
                    {inputs.data.integritySummary.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-600">
              {inputs.error
                ? `Your activity figures could not be loaded: ${inputs.error.message}`
                : "Calculating from your records…"}
            </p>
          )}
        </section>

        <section aria-labelledby="assessment-additional" className="grid gap-4">
          <div>
            <h3
              id="assessment-additional"
              className="font-semibold text-slate-950"
            >
              Additional information
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Collateral, finance and owner details. These are your declarations
              and are shown as such in the result. Leave a field blank if it
              doesn&apos;t apply.
            </p>
          </div>
          {profile.data ? (
            <CreditProfileFields profile={profile.data} />
          ) : (
            <p className="text-sm text-slate-600">
              {profile.error
                ? `Your saved information could not be loaded: ${profile.error.message}`
                : "Loading your saved information…"}
            </p>
          )}
        </section>
      </form>

      <DrawerFooter className="gap-3 border-t border-slate-200 bg-white p-6">
        {error ? (
          <Alert className="border-amber-200 bg-amber-50 text-amber-900">
            {error}
          </Alert>
        ) : null}
        {consent.data ? (
          consentActive ? (
            <p className="text-xs text-slate-500">
              MCBuse may use your saved business records for assessments.{" "}
              <button
                type="button"
                className="font-medium text-blue-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-blue-700"
                onClick={() => void withdrawConsent()}
                disabled={busy}
              >
                Withdraw consent
              </button>
            </p>
          ) : (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-blue-600"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
              />
              Use my saved business records for this assessment. I can withdraw
              this at any time.
            </label>
          )
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!canRun}
            aria-busy={busy}
          >
            {busy ? "Running…" : "Run assessment"}
          </Button>
          <DrawerClose asChild>
            <Button type="button" variant="secondary" disabled={busy}>
              Cancel
            </Button>
          </DrawerClose>
          {step ? (
            <p role="status" className="text-sm text-slate-600">
              {step}
            </p>
          ) : null}
        </div>
      </DrawerFooter>
    </>
  );
}

const DATE = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });
