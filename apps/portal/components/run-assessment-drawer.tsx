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
  AvailabilityBar,
  STATUS,
  StatusIcon,
  missingStatus,
  type InputStatus,
} from "@/components/assessment-status";
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
  open: controlledOpen,
  onOpenChange,
}: {
  merchantId: string | undefined;
  onCompleted: (outcome: AssessmentOutcome) => void | Promise<void>;
  /** Optional control, so other parts of the page can open the form. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  return (
    <Drawer direction="right" open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="lg" disabled={!merchantId}>
          Run credit assessment
        </Button>
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

  const derived = inputs.data?.inputs ?? [];
  const derivedCounts = {
    available: derived.filter((item) => item.value !== null).length,
    sales: derived.filter(
      (item) =>
        item.value === null && missingStatus(item.missingReason) === "sales",
    ).length,
    system: derived.filter(
      (item) =>
        item.value === null && missingStatus(item.missingReason) !== "sales",
    ).length,
  };

  return (
    <>
      <form
        id={FORM_ID}
        onSubmit={(event) => void run(event)}
        className="grid flex-1 content-start gap-8 overflow-y-auto p-6"
      >
        <section aria-labelledby="assessment-derived" className="grid gap-5">
          <StepHeading
            id="assessment-derived"
            step={1}
            title="Check what your records show"
            description={
              inputs.data
                ? `Calculated from your MCBuse payments and recorded cash sales, ${DATE.format(new Date(inputs.data.evidenceWindow.from))} – ${DATE.format(new Date(inputs.data.evidenceWindow.to))}. Nothing to do here: these fill in automatically and are never estimated.`
                : undefined
            }
          />
          {inputs.data ? (
            <>
              <AvailabilityBar
                counts={derivedCounts}
                label="From your activity"
              />
              <ul className="grid gap-2 sm:grid-cols-2">
                {derived.map((item) => {
                  const status: InputStatus =
                    item.value !== null
                      ? "available"
                      : missingStatus(item.missingReason);
                  return (
                    <li
                      key={item.key}
                      className={`flex min-w-0 items-start gap-3 rounded-lg border p-3 ${
                        status === "available"
                          ? "border-slate-200 bg-white"
                          : `${STATUS[status].border} ${STATUS[status].soft}`
                      }`}
                    >
                      <StatusIcon status={status} className="mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm text-slate-600">
                          {fieldLabel(item.key)}
                        </p>
                        {item.value !== null ? (
                          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-slate-950">
                            {inputValue(item.key, item.value)}
                          </p>
                        ) : (
                          <>
                            <p
                              className={`mt-0.5 text-sm font-semibold ${STATUS[status].text}`}
                            >
                              {STATUS[status].label}
                            </p>
                            {item.missingReason ? (
                              <p className="mt-0.5 text-xs text-slate-500">
                                {item.missingReason}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {inputs.data.integritySummary.length ? (
                <details className="text-sm text-slate-600">
                  <summary className="cursor-pointer font-medium text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-700">
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
            <p className="text-base text-slate-600">
              {inputs.error
                ? `Your activity figures could not be loaded: ${inputs.error.message}`
                : "Calculating from your records…"}
            </p>
          )}
        </section>

        <section aria-labelledby="assessment-additional" className="grid gap-5">
          <StepHeading
            id="assessment-additional"
            step={2}
            title="Add what's missing"
            description="Collateral, finance and owner details. Anything marked Missing is a quick way to strengthen your result. Leave a field blank if it doesn't apply."
          />
          {profile.data ? (
            <CreditProfileFields profile={profile.data} />
          ) : (
            <p className="text-base text-slate-600">
              {profile.error
                ? `Your saved information could not be loaded: ${profile.error.message}`
                : "Loading your saved information…"}
            </p>
          )}
        </section>
      </form>

      <DrawerFooter className="gap-4 border-t border-slate-200 bg-white p-6">
        <p className="flex items-center gap-2 text-base font-semibold text-slate-950">
          <StepNumber step={3} /> Run your assessment
        </p>
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
            <label
              className={`flex items-start gap-3 rounded-lg border p-3 text-sm text-slate-800 ${
                agreed ? "border-slate-200" : "border-amber-200 bg-amber-50"
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 size-5 accent-blue-600"
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
            size="lg"
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

function StepNumber({ step }: { step: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-7 shrink-0 place-items-center rounded-full bg-blue-600 font-mono text-sm font-semibold text-white"
    >
      {step}
    </span>
  );
}

function StepHeading({
  id,
  step,
  title,
  description,
}: {
  id: string;
  step: number;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <StepNumber step={step} />
      <div className="grid gap-1">
        <h3 id={id} className="text-lg font-semibold text-slate-950">
          <span className="sr-only">Step {step}: </span>
          {title}
        </h3>
        {description ? (
          <p className="text-sm text-slate-600">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

const DATE = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });
