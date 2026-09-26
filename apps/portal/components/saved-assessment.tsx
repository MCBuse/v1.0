import { CreditResult } from "./credit-result";
import type { SavedMerchantAssessment } from "@repo/shared";
export function SavedAssessmentDetail({
  assessment: a,
}: {
  assessment: SavedMerchantAssessment;
}) {
  const business = assessmentBusiness(a.businessProfile);
  return (
    <div className="grid gap-4 text-sm">
      <p className="text-lg font-semibold">{a.modelId === "george-financial-profile-v1" ? "George’s financial profile" : "Evidence readiness"}</p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Saved</dt>
          <dd>{new Date(a.createdAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Business</dt>
          <dd>{business.businessName ?? "Not available"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Evidence model / version</dt>
          <dd>
            {a.modelId} / {a.modelVersion}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Evidence period</dt>
          <dd>
            {new Date(a.evidenceWindow.from).toLocaleDateString()} –{" "}
            {new Date(a.evidenceWindow.to).toLocaleDateString()} (
            {a.evidenceWindow.days} days)
          </dd>
        </div>
      </dl>
      {a.credit ? <CreditResult credit={a.credit} /> : null}
      <h3 className="font-semibold">Evidence readiness: {a.stage.replaceAll("_", " ")}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="font-medium">Requirements met</h3>
          <ul className="list-disc pl-5">
            {a.passedRequirements.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-medium">Still needed</h3>
          <ul className="list-disc pl-5">
            {a.missingRequirements.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-slate-600">{a.disclaimer}</p>
      <details className="rounded-lg border border-slate-200 p-4">
        <summary className="cursor-pointer font-medium text-slate-950 focus-visible:outline-2 focus-visible:outline-blue-700">Evidence details and limitations</summary>
        <div className="mt-4 grid gap-4">
          <div><h3 className="font-medium">Payment reliability</h3><EvidenceFields value={a.reliability} /></div>
          <div><h3 className="font-medium">Evidence sources</h3><EvidenceFields value={a.sourceCoverage} /></div>
          <p>Evidence consent at assessment: {business.consent?.active ? "Active" : "Not active"}</p>
          <p className="font-mono text-xs">Assessment {a.id}</p>
          <ul className="list-disc pl-5 text-slate-600">{a.limitations.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </details>
    </div>
  );
}
function assessmentBusiness(value: Record<string, unknown>) {
  return value as { businessName?: string; consent?: { active?: boolean } };
}
function EvidenceFields({ value }: { value: Record<string, unknown> }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {Object.entries(value).map(([key, entry]) => (
        <div key={key}>
          <dt className="text-slate-500">
            {key.replace(/([A-Z])/g, " $1").replaceAll("_", " ")}
          </dt>
          <dd>
            {entry && typeof entry === "object" && !Array.isArray(entry) ? (
              <EvidenceFields value={entry as Record<string, unknown>} />
            ) : typeof entry === "boolean" ? (
              entry ? (
                "Yes"
              ) : (
                "No"
              )
            ) : (
              String(entry ?? "Not available")
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
