import type { CreditPublicResult } from "@repo/shared";
import { fieldLabel } from "./assessment-labels";

/** `showModelDetails` is for staff views; merchants see plain-language labels only. */
export function CreditResult({
  credit: c,
  showModelDetails = false,
}: {
  credit: CreditPublicResult;
  showModelDetails?: boolean;
}) {
  return (
    <section className="grid gap-4 text-sm">
      <div>
        <h3 className="font-semibold">{showModelDetails ? "George’s business financial profile" : "Financial profile"}</h3>
        {showModelDetails ? <p className="mt-1 text-xs text-slate-500">Model {c.modelVersion}</p> : null}
      </div>
      {c.status !== "ready" ? (
        <p role="status">
          {c.status === "consent_required"
            ? "Give consent to use your business records so we can calculate your score."
            : "Scoring is temporarily unavailable. Your assessment has still been saved — please try again later."}
        </p>
      ) : null}
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt>Financial profile score</dt>
          <dd className="mt-1 text-xl font-semibold">
            {c.financialProfile
              ? `${c.financialProfile.score.toFixed(1)} / 100`
              : "Not available"}
          </dd>
        </div>
        <div>
          <dt>Data confidence</dt>
          <dd className="mt-1 text-xl font-semibold">
            {c.profileConfidence?.label ?? "Not available"}
          </dd>
          {c.profileConfidence ? (
            <p className="mt-1 text-xs text-slate-500">
              Coverage {c.profileConfidence.coveragePct.toFixed(1)}% ·
              Data quality{" "}
              {c.profileConfidence.dataReliabilityQualityPct?.toFixed(1) ??
                "unavailable"}
              {c.profileConfidence.dataReliabilityQualityPct !== null
                ? "%"
                : ""}
            </p>
          ) : null}
        </div>
      </dl>
      {c.status === "ready" && !c.financialProfile ? (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
          We can’t calculate a score yet. Add the missing information listed below, then run a new assessment.
        </p>
      ) : null}
      <p className="text-xs leading-5 text-slate-500">
        Data confidence reflects how complete and reliable the records are, not how strong the business is.
        Information you declare is not independently verified. This is not a
        lending decision.
      </p>
      <div>
        <h4 className="font-medium">{showModelDetails ? "Merchant integrity summary" : "Record summary"}</h4>
        <ul className="mt-2 grid gap-2">
          {c.integritySummary.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
      {Object.keys(c.missingReasons).length ? (
        <div>
          <h4 className="font-medium">Missing information</h4>
          <ul className="mt-2 grid gap-2">
            {Object.entries(c.missingReasons).map(([key, reason]) => (
              <li key={key}>
                <span className="font-medium">{showModelDetails ? key.replaceAll("_", " ") : fieldLabel(key)}:</span>{" "}
                {reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
