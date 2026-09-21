import type { CreditPublicResult } from "@repo/shared";
export function CreditResult({ credit: c }: { credit: CreditPublicResult }) {
  return (
    <section className="grid gap-4 text-sm">
      <div>
        <h3 className="font-semibold">Business financial profile</h3>
        <p className="mt-1 text-xs text-slate-500">Model {c.modelVersion}</p>
      </div>
      {c.status !== "ready" ? (
        <p role="status">
          {c.status === "consent_required"
            ? "Give evidence-assessment consent to calculate profile results."
            : "Scoring is temporarily unavailable. Your evidence-readiness result is still saved."}
        </p>
      ) : null}
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt>Financial Profile Score</dt>
          <dd className="mt-1 text-xl font-semibold">
            {c.financialProfile
              ? `${c.financialProfile.score.toFixed(1)} / 100`
              : "Not available"}
          </dd>
        </div>
        <div>
          <dt>Profile Confidence</dt>
          <dd className="mt-1 text-xl font-semibold">
            {c.profileConfidence?.label ?? "Not available"}
          </dd>
          {c.profileConfidence ? (
            <p className="mt-1 text-xs text-slate-500">
              Coverage {c.profileConfidence.coveragePct.toFixed(1)}% ·
              Processing quality{" "}
              {c.profileConfidence.dataReliabilityQualityPct?.toFixed(1) ??
                "unavailable"}
              {c.profileConfidence.dataReliabilityQualityPct !== null
                ? "%"
                : ""}
            </p>
          ) : null}
        </div>
      </dl>
      <p className="text-xs leading-5 text-slate-500">
        Confidence describes field completeness and processing quality. Declared
        information is not independently verified. These results are not a
        lending decision.
      </p>
      <div>
        <h4 className="font-medium">Merchant integrity summary</h4>
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
                <span className="font-medium">{key.replaceAll("_", " ")}:</span>{" "}
                {reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
