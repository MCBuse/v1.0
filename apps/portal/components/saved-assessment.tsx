import { CreditResult } from './credit-result';
import type { SavedMerchantAssessment } from "@repo/shared";
export function SavedAssessmentDetail({
  assessment: a,
}: {
  assessment: SavedMerchantAssessment;
}) {
  return (
    <div className="grid gap-4 text-sm">
      <p className="text-lg font-semibold">{a.stage.replaceAll("_", " ")}</p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Assessment</dt>
          <dd>{a.id}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Saved</dt>
          <dd>{new Date(a.createdAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Model / version</dt>
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
      <h3 className="font-medium">Payment reliability</h3>
      <EvidenceFields value={a.reliability} />
      <h3 className="font-medium">Evidence sources</h3>
      <EvidenceFields value={a.sourceCoverage} />
      <h3 className="font-medium">
        Business profile and consent at assessment
      </h3>
      <EvidenceFields value={a.businessProfile} />
      {a.credit ? <CreditResult credit={a.credit}/> : null}
      <p>{a.disclaimer}</p>
      <ul className="list-disc pl-5 text-slate-600">
        {a.limitations.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
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
