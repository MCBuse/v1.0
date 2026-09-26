import { Check, Minus } from "lucide-react";
import type { CreditPublicResult, SavedMerchantAssessment } from "@repo/shared";
import { Badge } from "@repo/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import { fieldLabel, stageLabel, stageTone } from "./assessment-labels";

const DATE = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * The seven evidence-readiness checks, in the order the API evaluates them,
 * with merchant wording and the measurement that backs each one.
 */
const READINESS_CHECKS: Array<{
  api: string;
  label: string;
  measure?: { key: string; unit?: "%" };
}> = [
  { api: "At least 30 observed days", label: "At least 30 days of records", measure: { key: "observedDays" } },
  { api: "At least 10 active days", label: "Sales on at least 10 days", measure: { key: "activeDays" } },
  { api: "At least 25 finalized payments", label: "At least 25 verified payments", measure: { key: "finalizedPayments" } },
  { api: "Capture quality of at least 98%", label: "Payment capture quality of 98% or more", measure: { key: "captureQualityPercent", unit: "%" } },
  { api: "Payment finality of at least 98%", label: "98% or more of payments completed", measure: { key: "finalityPercent", unit: "%" } },
  { api: "Evidence consent is active", label: "Consent to use your business records" },
  { api: "No unresolved critical exception", label: "No unresolved critical payment issues" },
];

type MissingGroup = "declared" | "payments" | "system";

/** Sorts a missing input by why it is missing, so each group gets one clear next step. */
function missingGroup(reason: string): MissingGroup {
  if (/not provided in the business credit profile/i.test(reason)) return "declared";
  if (/insufficient compatible verified records/i.test(reason)) return "payments";
  return "system";
}

const GROUP_COPY: Record<MissingGroup, { title: string; hint: string }> = {
  declared: {
    title: "You can add these",
    hint: "Fill them in under Additional information the next time you run a credit assessment.",
  },
  payments: {
    title: "These build up as you take payments",
    hint: "They're calculated from verified payments taken through MCBuse in this period. Cash sales you record yourself aren't counted.",
  },
  system: {
    title: "Not measured yet",
    hint: "MCBuse can't measure these yet. You don't need to do anything.",
  },
};

export function SavedAssessmentDetail({
  assessment: a,
  title = "Credit assessment",
  titleAs: Title = "h3",
}: {
  assessment: SavedMerchantAssessment;
  title?: string;
  titleAs?: "h2" | "h3";
}) {
  const business = assessmentBusiness(a.businessProfile);
  const credit = a.credit;
  const nextStep = nextStepFor(a.stage, credit);

  return (
    <div className="grid gap-6 text-sm text-slate-700">
      {/* Header: what this is, whose it is, and its status at a glance. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Title className="text-lg font-semibold text-slate-950">{title}</Title>
          <p className="mt-1 text-slate-600">
            {business.businessName ? <>{business.businessName} · </> : null}
            {DATE.format(new Date(a.evidenceWindow.from))} –{" "}
            {DATE.format(new Date(a.evidenceWindow.to))} ({a.evidenceWindow.days} days)
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Saved <span className="font-mono tabular-nums">{DATE_TIME.format(new Date(a.createdAt))}</span>
          </p>
        </div>
        <Badge tone={stageTone(a.stage)}>{stageLabel(a.stage)}</Badge>
      </div>

      {nextStep ? (
        <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="font-medium text-slate-950">{nextStep.title}</p>
          <p className="mt-0.5 text-slate-600">{nextStep.body}</p>
        </div>
      ) : null}

      {credit ? <ResultFigures credit={credit} /> : null}
      {credit ? <MissingInformation credit={credit} /> : null}

      <ReadinessChecklist assessment={a} hasCredit={Boolean(credit)} />

      <p className="text-xs leading-5 text-slate-500">
        Information you declare is not independently verified. This assessment is
        not a lending decision.
      </p>

      <details className="rounded-lg border border-slate-200 px-4 py-3">
        <summary className="cursor-pointer font-medium text-slate-950 focus-visible:outline-2 focus-visible:outline-blue-700">
          How this assessment was made
        </summary>
        <div className="mt-3 grid gap-4">
          {credit?.integritySummary.length ? (
            <div>
              <h4 className="font-medium text-slate-950">Records used</h4>
              <ul className="mt-1 grid list-disc gap-1 pl-5 text-slate-600">
                {credit.integritySummary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {a.limitations.length ? (
            <div>
              <h4 className="font-medium text-slate-950">Limitations</h4>
              <ul className="mt-1 grid list-disc gap-1 pl-5 text-slate-600">
                {a.limitations.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-slate-500">
            Reference <span className="font-mono">{a.id}</span>
          </p>
        </div>
      </details>
    </div>
  );
}

/** One short, prioritised instruction instead of several competing messages. */
function nextStepFor(stage: string, credit: CreditPublicResult | undefined) {
  if (credit?.status === "consent_required" || stage === "consent_required")
    return {
      title: "Your consent is needed",
      body: "We can't calculate your score until you allow MCBuse to use your business records. Tick the consent box when you next run a credit assessment.",
    };
  if (credit?.status === "temporarily_unavailable" || stage === "scoring_unavailable")
    return {
      title: "Scoring is temporarily unavailable",
      body: "Your assessment has been saved. Please run it again later to get your score.",
    };
  if (credit && !credit.financialProfile) {
    const count = Object.keys(credit.missingReasons).length;
    return {
      title: "We can't calculate your score yet",
      body: `${count} ${count === 1 ? "piece of information is" : "pieces of information are"} missing. See what's needed below.`,
    };
  }
  if (stage === "integrity_review")
    return {
      title: "A payment issue needs attention",
      body: "Resolve the open critical payment issue, then run a new assessment.",
    };
  return null;
}

function ResultFigures({ credit: c }: { credit: CreditPublicResult }) {
  const provenance = Object.values(c.provenance ?? {});
  const filled = c.profileConfidence?.fieldsFilled ?? provenance.filter((p) => p !== "unavailable").length;
  const total = c.profileConfidence?.fieldsTotal ?? provenance.length;
  return (
    <dl className="grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-3">
      <Figure
        label="Financial profile score"
        value={c.financialProfile ? c.financialProfile.score.toFixed(1) : "—"}
        suffix={c.financialProfile ? "/ 100" : undefined}
        hint={c.financialProfile ? "Higher is stronger" : "Not calculated yet"}
      />
      <Figure
        label="Confidence"
        value={c.profileConfidence?.label ?? "—"}
        hint={c.profileConfidence ? "How complete and reliable your records are" : "Not calculated yet"}
      />
      <Figure
        label="Information available"
        value={total ? String(filled) : "—"}
        suffix={total ? `of ${total}` : undefined}
        hint="Items used to calculate your score"
      />
    </dl>
  );
}

function Figure({ label, value, suffix, hint }: { label: string; value: string; suffix?: string; hint: string }) {
  return (
    <div className="bg-white p-4">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-semibold tabular-nums text-slate-950">{value}</span>
        {suffix ? <span className="text-sm text-slate-500">{suffix}</span> : null}
      </dd>
      <dd className="mt-1 text-xs text-slate-500">{hint}</dd>
    </div>
  );
}

function MissingInformation({ credit: c }: { credit: CreditPublicResult }) {
  const entries = Object.entries(c.missingReasons);
  if (!entries.length) return null;
  const groups: Record<MissingGroup, Array<[string, string]>> = { declared: [], payments: [], system: [] };
  for (const entry of entries) groups[missingGroup(entry[1])].push(entry);

  return (
    <section aria-labelledby="missing-information" className="grid gap-3">
      <h4 id="missing-information" className="font-semibold text-slate-950">
        What&apos;s missing
      </h4>
      <div className="grid divide-y divide-slate-200 rounded-lg border border-slate-200">
        {(Object.keys(GROUP_COPY) as MissingGroup[]).map((group) =>
          groups[group].length ? (
            <div key={group} className="grid gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-slate-950">{GROUP_COPY[group].title}</p>
                <span className="font-mono text-xs tabular-nums text-slate-500">{groups[group].length}</span>
              </div>
              <p className="text-slate-600">{GROUP_COPY[group].hint}</p>
              <ul className="mt-1 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {groups[group].map(([key, reason]) => (
                  <li key={key} className="flex gap-2 text-slate-950">
                    <Minus size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400" />
                    <span>
                      {fieldLabel(key)}
                      {group === "system" ? (
                        <span className="block text-xs text-slate-500">{reason}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </div>
    </section>
  );
}

function ReadinessChecklist({ assessment: a, hasCredit }: { assessment: SavedMerchantAssessment; hasCredit: boolean }) {
  const passed = new Set(a.passedRequirements);
  const missing = new Set(a.missingRequirements);
  const known = new Set(READINESS_CHECKS.map((c) => c.api));
  const rows = READINESS_CHECKS.filter((c) => passed.has(c.api) || missing.has(c.api)).map((c) => ({
    key: c.api,
    label: c.label,
    met: passed.has(c.api),
    measured: c.measure ? formatMeasure(a.reliability[c.measure.key], c.measure.unit) : null,
  }));
  // Anything the API adds later still shows. With a credit result, unknown
  // missing items are model inputs, which "What's missing" already lists.
  for (const item of a.passedRequirements)
    if (!known.has(item)) rows.push({ key: item, label: item, met: true, measured: null });
  if (!hasCredit)
    for (const item of a.missingRequirements)
      if (!known.has(item)) rows.push({ key: item, label: item, met: false, measured: null });
  if (!rows.length) return null;
  const metCount = rows.filter((r) => r.met).length;

  return (
    <section aria-labelledby="readiness-checklist" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 id="readiness-checklist" className="font-semibold text-slate-950">
          Payment history checklist
        </h4>
        <span className="text-xs text-slate-500">
          <span className="font-mono tabular-nums">{metCount}</span> of{" "}
          <span className="font-mono tabular-nums">{rows.length}</span> met
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Requirement</TableHead>
              <TableHead scope="col" className="text-right">Yours</TableHead>
              <TableHead scope="col" className="w-24">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="text-slate-950">{row.label}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-slate-700">{row.measured ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {row.met ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-700">
                      <Check size={16} aria-hidden="true" /> Met
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-slate-500">
                      <Minus size={16} aria-hidden="true" /> Not yet
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function formatMeasure(value: unknown, unit?: "%") {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return unit === "%" ? `${value.toFixed(1)}%` : String(Math.round(value));
}

function assessmentBusiness(value: Record<string, unknown>) {
  return value as { businessName?: string };
}
