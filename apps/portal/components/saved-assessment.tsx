"use client";

import {
  financialProfileBand,
  type CreditPublicResult,
  type SavedMerchantAssessment,
} from "@repo/shared";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { ArrowRight, Info, X } from "lucide-react";
import { useId, useState } from "react";
import { fieldLabel, stageLabel, stageTone } from "./assessment-labels";
import { CreditScoreScale } from "./credit-score-scale";
import {
  AvailabilityBar,
  STATUS,
  StatusIcon,
  missingStatus,
  type InputStatus,
} from "./assessment-status";

const DATE = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * The seven evidence-readiness checks, in the order the API evaluates them,
 * with merchant wording, the measurement behind each one and its target.
 */
const READINESS_CHECKS: Array<{
  api: string;
  label: string;
  measure?: { key: string; target: number; unit?: "%"; noun?: string };
}> = [
  {
    api: "At least 30 observed days",
    label: "At least 30 days of records",
    measure: { key: "observedDays", target: 30, noun: "days" },
  },
  {
    api: "At least 10 active days",
    label: "Sales on at least 10 days",
    measure: { key: "activeDays", target: 10, noun: "days" },
  },
  {
    api: "At least 25 finalized payments",
    label: "At least 25 verified payments",
    measure: { key: "finalizedPayments", target: 25, noun: "payments" },
  },
  {
    api: "Capture quality of at least 98%",
    label: "Payment capture quality of 98% or more",
    measure: { key: "captureQualityPercent", target: 98, unit: "%" },
  },
  {
    api: "Payment finality of at least 98%",
    label: "98% or more of payments completed",
    measure: { key: "finalityPercent", target: 98, unit: "%" },
  },
  {
    api: "Evidence consent is active",
    label: "Consent to use your business records",
  },
  {
    api: "No unresolved critical exception",
    label: "No unresolved critical payment issues",
  },
];

const GROUP_COPY: Record<
  Exclude<InputStatus, "available">,
  { title: string; hint: string }
> = {
  declare: {
    title: "You can add these now",
    hint: "Fill them in under Additional information when you run your next assessment.",
  },
  sales: {
    title: "These build up as you record sales",
    hint: "They're calculated from your MCBuse payments and the cash sales you record. Keep recording sales and they'll fill in.",
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
  onAddInformation,
}: {
  assessment: SavedMerchantAssessment;
  title?: string;
  titleAs?: "h2" | "h3";
  /** Opens the assessment form; when omitted the page shows guidance only. */
  onAddInformation?: () => void;
}) {
  const business = assessmentBusiness(a.businessProfile);
  const credit = a.credit;

  return (
    <div className="grid gap-8 text-sm text-slate-700">
      {/* Header: what this is, whose it is, and its status at a glance. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Title className="text-lg font-semibold text-slate-950">
            {title}
          </Title>
          <p className="mt-1 text-slate-600">
            {business.businessName ? <>{business.businessName} · </> : null}
            {DATE.format(new Date(a.evidenceWindow.from))} –{" "}
            {DATE.format(new Date(a.evidenceWindow.to))} (
            {a.evidenceWindow.days} days)
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Saved{" "}
            <span className="font-mono tabular-nums">
              {DATE_TIME.format(new Date(a.createdAt))}
            </span>
          </p>
        </div>
        <Badge tone={stageTone(a.stage)}>{stageLabel(a.stage)}</Badge>
      </div>

      <ResultHero
        stage={a.stage}
        credit={credit}
        onAddInformation={onAddInformation}
      />

      {credit ? (
        <InformationBreakdown
          credit={credit}
          onAddInformation={onAddInformation}
        />
      ) : null}

      <ReadinessChecklist assessment={a} hasCredit={Boolean(credit)} />

      <p className="text-xs leading-5 text-slate-500">
        Information you declare is not independently verified. This assessment
        is not a lending decision.
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

/** One clear instruction for whatever stands between the merchant and a score. */
function nextStepFor(stage: string, credit: CreditPublicResult | undefined) {
  if (credit?.status === "consent_required" || stage === "consent_required")
    return {
      title: "Your consent is needed",
      body: "We can't calculate your score until you allow MCBuse to use your business records. Tick the consent box when you run your next assessment.",
      action: "Run a new assessment",
    };
  if (
    credit?.status === "temporarily_unavailable" ||
    stage === "scoring_unavailable"
  )
    return {
      title: "Scoring is temporarily unavailable",
      body: "Your assessment has been saved. Run it again a little later to get your score.",
      action: "Try again",
    };
  if (credit && !credit.financialProfile) {
    const reasons = Object.values(credit.missingReasons);
    const addable = reasons.filter(
      (r) => missingStatus(r) === "declare",
    ).length;
    return addable
      ? {
          title: "Your score isn't ready yet",
          body: `Add ${addable} missing ${addable === 1 ? "detail" : "details"} to move closer to a score. ${reasons.length - addable ? "Some other items build up as you record sales." : ""}`.trim(),
          action: `Add ${addable} missing ${addable === 1 ? "detail" : "details"}`,
        }
      : {
          title: "Your score isn't ready yet",
          body: "Keep recording sales. The missing items fill in as your activity builds up, then run a new assessment.",
          action: null,
        };
  }
  if (stage === "integrity_review")
    return {
      title: "A payment issue needs attention",
      body: "Resolve the open critical payment issue, then run a new assessment.",
      action: null,
    };
  return null;
}

function ResultHero({
  stage,
  credit,
  onAddInformation,
}: {
  stage: string;
  credit: CreditPublicResult | undefined;
  onAddInformation?: () => void;
}) {
  const score = credit?.financialProfile?.score;
  const confidence = credit?.profileConfidence;
  const creditScore = credit?.creditScore;
  const next = nextStepFor(stage, credit);

  if (creditScore)
    return (
      <section
        aria-label="Result"
        className="grid gap-6 rounded-xl border border-emerald-200 bg-emerald-50 p-6 lg:grid-cols-[1fr_minmax(0,16rem)]"
      >
        <div className="grid gap-3">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <StatusIcon status="available" /> Your credit score
          </p>
          <p className="flex items-baseline gap-3">
            <span className="font-mono text-5xl font-semibold tabular-nums text-slate-950">
              {creditScore.score}
            </span>
            <span className="text-xl font-semibold text-slate-900">
              {creditScore.grade}
            </span>
          </p>
          <CreditScoreScale credit={creditScore} />
          <p className="text-sm text-slate-600">
            On a scale of 300 to 850. Higher is stronger. Lenders make their
            own decision.
          </p>
        </div>
        {typeof score === "number" ? (
          <ReadinessPanel score={score} confidence={confidence ?? null} />
        ) : null}
      </section>
    );

  if (typeof score === "number") {
    const band = financialProfileBand(score);
    const tone = BAND_TONE[band.label];
    return (
      <section
        aria-label="Result"
        className={`grid gap-5 rounded-xl border p-6 sm:grid-cols-[1fr_auto] sm:items-end ${tone.frame}`}
      >
        <div className="grid gap-3">
          <p
            className={`inline-flex items-center gap-2 text-sm font-semibold ${tone.text}`}
          >
            <StatusIcon status="available" /> Your financial profile score
          </p>
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-5xl font-semibold tabular-nums text-slate-950">
              {score.toFixed(1)}
            </span>
            <span className="text-lg text-slate-600">/ 100</span>
            <span className={`ml-1 text-xl font-semibold ${tone.text}`}>
              {band.label}
            </span>
          </p>
          <div
            className="h-2.5 w-full max-w-md overflow-hidden rounded-full bg-white ring-1 ring-slate-200/60"
            role="img"
            aria-label={`Score ${score.toFixed(1)} out of 100, ${band.label}`}
          >
            <div
              className={`h-full rounded-full ${tone.bar}`}
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
          <p className="text-sm text-slate-600">
            {BAND_COPY[band.label]} This is not a lending decision.
          </p>
        </div>
        {confidence ? (
          <DataConfidence confidence={confidence} align="end" />
        ) : null}
      </section>
    );
  }

  if (!next) return null;
  return (
    <section
      aria-label="Result"
      aria-live="polite"
      className="grid gap-4 rounded-xl border border-amber-200 bg-amber-50 p-6"
    >
      <div className="flex items-start gap-3">
        <StatusIcon status="declare" className="mt-1 size-6" />
        <div className="grid gap-1">
          <p className="text-xl font-semibold text-slate-950">{next.title}</p>
          <p className="max-w-prose text-base text-slate-700">{next.body}</p>
        </div>
      </div>
      {next.action && onAddInformation ? (
        <div className="sm:pl-9">
          <Button size="lg" onClick={onAddInformation}>
            {next.action} <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </section>
  );
}

type BandLabel = ReturnType<typeof financialProfileBand>["label"];

/** Only a Good or Strong profile is framed as a success; the colour never outruns the number. */
const BAND_TONE: Record<
  BandLabel,
  { frame: string; text: string; bar: string }
> = {
  Strong: {
    frame: "border-emerald-200 bg-emerald-50",
    text: "text-emerald-800",
    bar: "bg-emerald-500",
  },
  Good: {
    frame: "border-emerald-200 bg-emerald-50",
    text: "text-emerald-800",
    bar: "bg-emerald-500",
  },
  Fair: {
    frame: "border-slate-200 bg-slate-50",
    text: "text-slate-800",
    bar: "bg-blue-500",
  },
  Weak: {
    frame: "border-amber-200 bg-amber-50",
    text: "text-amber-800",
    bar: "bg-amber-500",
  },
};

const BAND_COPY: Record<BandLabel, string> = {
  Strong: "A strong recorded business profile.",
  Good: "A good recorded business profile, with room to grow.",
  Fair: "A fair profile: steady activity, with clear ways to strengthen it.",
  Weak: "An early profile: more recorded activity will strengthen it.",
};

const CONFIDENCE_TONE = {
  High: "success",
  Medium: "info",
  Low: "warning",
} as const;

/**
 * Data confidence, named as such: it rates how complete and reliable the
 * records are, not how strong the business is, so a mid score with high data
 * confidence reads as "we are sure of this middling result", not a
 * contradiction. When unmet evidence checks lowered the label, it says so.
 */
function DataConfidence({
  confidence,
  align = "start",
}: {
  confidence: NonNullable<CreditPublicResult["profileConfidence"]>;
  align?: "start" | "end";
}) {
  const limitedBy = confidence.limitedBy ?? [];
  return (
    <div
      className={`grid max-w-xs gap-1 text-sm text-slate-600 ${
        align === "end" ? "sm:justify-items-end sm:text-right" : ""
      }`}
    >
      <p className="flex flex-wrap items-center gap-2">
        Data confidence
        <Badge
          tone={CONFIDENCE_TONE[confidence.label]}
          className={align === "end" ? "px-3 py-1 text-sm" : undefined}
        >
          {confidence.label}
        </Badge>
      </p>
      <p className="text-xs text-slate-500">
        How complete and reliable your records are.{" "}
        <span className="font-mono tabular-nums">
          {confidence.fieldsFilled}
        </span>{" "}
        of{" "}
        <span className="font-mono tabular-nums">
          {confidence.fieldsTotal}
        </span>{" "}
        items provided.
      </p>
      {limitedBy.length ? (
        <p className="text-xs text-slate-500">
          Held at {confidence.label} until{" "}
          {limitedBy.length === 1
            ? "1 payment history check is"
            : `${limitedBy.length} payment history checks are`}{" "}
          met.
        </p>
      ) : null}
    </div>
  );
}

/** The 0–100 financial profile, shown to the merchant as how ready they are. */
function ReadinessPanel({
  score,
  confidence,
}: {
  score: number;
  confidence: CreditPublicResult["profileConfidence"];
}) {
  return (
    <div className="grid content-start gap-3 border-t border-emerald-200 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
      <p className="text-sm font-semibold text-slate-700">Financial profile</p>
      <p className="flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-semibold tabular-nums text-slate-950">
          {score.toFixed(1)}
        </span>
        <span className="text-base text-slate-600">/ 100</span>
        <span className="ml-1 text-base font-semibold text-slate-700">
          {financialProfileBand(score).label}
        </span>
      </p>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-white"
        role="img"
        aria-label={`Financial profile ${score.toFixed(1)} out of 100`}
      >
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      <p className="text-sm text-slate-600">
        How ready your records are to show a lender.
      </p>
      {confidence ? <DataConfidence confidence={confidence} /> : null}
    </div>
  );
}

function InformationBreakdown({
  credit: c,
  onAddInformation,
}: {
  credit: CreditPublicResult;
  onAddInformation?: () => void;
}) {
  const missing = new Set(Object.keys(c.missingReasons));
  const available = Object.keys(c.provenance ?? {}).filter(
    (key) => !missing.has(key) && c.provenance[key] !== "unavailable",
  );
  const groups: Record<
    Exclude<InputStatus, "available">,
    Array<[string, string]>
  > = {
    declare: [],
    sales: [],
    system: [],
  };
  for (const entry of Object.entries(c.missingReasons))
    groups[missingStatus(entry[1])].push(entry);
  const counts = {
    available: available.length,
    declare: groups.declare.length,
    sales: groups.sales.length,
    system: groups.system.length,
  };

  return (
    <section aria-labelledby="information-breakdown" className="grid gap-5">
      <ScoreExplainer />
      <AvailabilityBar
        counts={counts}
        label="Items the score is calculated from"
      />

      <div className="grid gap-4">
        {(["declare", "sales", "system"] as const).map((group) =>
          groups[group].length ? (
            <div
              key={group}
              className={`grid gap-3 rounded-xl border p-5 ${STATUS[group].border} ${STATUS[group].soft}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <StatusIcon status={group} className="mt-0.5" />
                  <div>
                    <p className="text-base font-semibold text-slate-950">
                      {GROUP_COPY[group].title}{" "}
                      <span
                        className={`font-mono tabular-nums ${STATUS[group].text}`}
                      >
                        ({groups[group].length})
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {GROUP_COPY[group].hint}
                    </p>
                  </div>
                </div>
                {group === "declare" && onAddInformation ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onAddInformation}
                  >
                    Add these details{" "}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
              <ul className="grid gap-x-6 gap-y-2 pl-7 sm:grid-cols-2">
                {groups[group].map(([key, reason]) => (
                  <li key={key} className="text-[15px] text-slate-950">
                    {fieldLabel(key)}
                    {group === "system" ? (
                      <span className="block text-xs text-slate-500">
                        {reason}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}

        {available.length ? (
          <details
            className={`group rounded-xl border p-5 ${STATUS.available.border}`}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-blue-700">
              <StatusIcon status="available" />
              <span className="text-base font-semibold text-slate-950">
                Already available{" "}
                <span className="font-mono tabular-nums text-emerald-700">
                  ({available.length})
                </span>
              </span>
              <span className="ml-auto text-sm font-medium text-blue-700 group-open:hidden">
                Show
              </span>
              <span className="ml-auto hidden text-sm font-medium text-blue-700 group-open:inline">
                Hide
              </span>
            </summary>
            <ul className="mt-3 flex flex-wrap gap-2 pl-7">
              {available.map((key) => (
                <li
                  key={key}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800"
                >
                  {fieldLabel(key)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The "Information behind your score" heading, with an info button that opens
 * a short plain-language note on what moves the score and how it is built.
 */
function ScoreExplainer() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <h4
          id="information-breakdown"
          className="text-lg font-semibold text-slate-950"
        >
          Information behind your score
        </h4>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={
            open ? "Hide how the score works" : "How the score works"
          }
          onClick={() => setOpen((value) => !value)}
          className="inline-flex size-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-blue-700"
        >
          {open ? (
            <X className="size-4" aria-hidden="true" />
          ) : (
            <Info className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
      <div
        id={panelId}
        hidden={!open}
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700"
      >
        <p className="font-semibold text-slate-950">How your score works</p>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="font-medium text-slate-950">What it measures</dt>
            <dd className="mt-1">
              The score summarises your recorded business on a 0–100 scale:
              how long you have traded, how often and how steadily you sell,
              your sales trend and your existing debt compared with sales.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-950">What moves it</dt>
            <dd className="mt-1">
              Regular sales on more days, steady or growing revenue and
              verified MCBuse payments raise it. Gaps in trading, failed or
              unresolved payments and high debt lower it.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-950">Data confidence</dt>
            <dd className="mt-1">
              A separate rating of how complete and reliable your records are.
              It can only be High once every payment history check below is
              met.
            </dd>
          </div>
        </dl>
        <p className="text-xs text-slate-500">
          Items you declare are used as given and are not independently
          verified. Missing items are never estimated.
        </p>
      </div>
    </div>
  );
}

function ReadinessChecklist({
  assessment: a,
  hasCredit,
}: {
  assessment: SavedMerchantAssessment;
  hasCredit: boolean;
}) {
  const passed = new Set(a.passedRequirements);
  const missing = new Set(a.missingRequirements);
  const known = new Set(READINESS_CHECKS.map((c) => c.api));
  const rows = READINESS_CHECKS.filter(
    (c) => passed.has(c.api) || missing.has(c.api),
  ).map((c) => {
    const raw = c.measure ? a.reliability[c.measure.key] : undefined;
    return {
      key: c.api,
      label: c.label,
      met: passed.has(c.api),
      value: typeof raw === "number" && Number.isFinite(raw) ? raw : null,
      measure: c.measure,
    };
  });
  // Anything the API adds later still shows. With a credit result, unknown
  // missing items are model inputs, which the breakdown above already lists.
  for (const item of a.passedRequirements)
    if (!known.has(item))
      rows.push({
        key: item,
        label: item,
        met: true,
        value: null,
        measure: undefined,
      });
  if (!hasCredit)
    for (const item of a.missingRequirements)
      if (!known.has(item))
        rows.push({
          key: item,
          label: item,
          met: false,
          value: null,
          measure: undefined,
        });
  if (!rows.length) return null;
  const metCount = rows.filter((r) => r.met).length;

  return (
    <section aria-labelledby="readiness-checklist" className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4
          id="readiness-checklist"
          className="text-lg font-semibold text-slate-950"
        >
          Payment history checklist
        </h4>
        <p className="text-base font-semibold text-slate-950">
          <span className="font-mono tabular-nums">{metCount}</span> of{" "}
          <span className="font-mono tabular-nums">{rows.length}</span> met
        </p>
      </div>
      <p className="-mt-2 text-sm text-slate-600">
        {metCount === rows.length
          ? "Every check is met, so your data confidence can reach High."
          : `Data confidence stays below High until every check is met. ${rows.length - metCount} still to go.`}
      </p>
      <ul className="grid divide-y divide-slate-200 rounded-xl border border-slate-200">
        {rows.map((row) => {
          const status: InputStatus = row.met ? "available" : "sales";
          const pct =
            row.measure && row.value !== null
              ? Math.min(100, (row.value / row.measure.target) * 100)
              : null;
          return (
            <li key={row.key} className="grid gap-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-start gap-2.5 text-[15px] text-slate-950">
                  <StatusIcon status={status} className="mt-0.5" />
                  {row.label}
                </p>
                <p
                  className={`shrink-0 text-sm font-semibold ${STATUS[status].text}`}
                >
                  {row.met ? "Met" : "Not yet"}
                </p>
              </div>
              {row.measure ? (
                <div className="grid gap-1.5 pl-7">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${STATUS[status].bar}`}
                      style={{ width: `${pct ?? 0}%` }}
                    />
                  </div>
                  <p className="text-sm text-slate-600">
                    {row.value === null ? (
                      "Not measured yet"
                    ) : (
                      <>
                        <span className="font-mono tabular-nums text-slate-950">
                          {row.measure.unit === "%"
                            ? `${row.value.toFixed(1)}%`
                            : Math.round(row.value)}
                        </span>{" "}
                        of{" "}
                        <span className="font-mono tabular-nums">
                          {row.measure.target}
                          {row.measure.unit ?? ""}
                        </span>
                        {row.measure.noun ? ` ${row.measure.noun}` : ""}
                      </>
                    )}
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function assessmentBusiness(value: Record<string, unknown>) {
  return value as { businessName?: string };
}
