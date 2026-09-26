"use client";
import { useCallback, useEffect, useState } from "react";
import type { StaffCreditAssessment } from "@repo/shared";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Alert } from "@repo/ui/alert";
import { getCsrfToken } from "@/lib/client/csrf";
import { CreditResult } from "@/components/credit-result";
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (init.method === "POST" && !getCsrfToken()) await api("me");
  const response = await fetch(`/api/staff/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}),
      ...init.headers,
    },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? "Request failed");
  return result;
}
export function StaffCreditWorkspace() {
  const [options, setOptions] = useState<{
    merchants: { id: string; name: string }[];
    syntheticExamples: string[];
  } | null>(null);
  const [target, setTarget] = useState("example:complete");
  const [history, setHistory] = useState<StaffCreditAssessment[]>([]);
  const [selected, setSelected] = useState<StaffCreditAssessment | null>(null);
  const [comparison, setComparison] = useState("");
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<{ target: string; key: string } | null>(
    null,
  );
  const loadHistory = useCallback(async () => {
    setHistory(
      (
        await api<{ assessments: StaffCreditAssessment[] }>(
          `credit-assessments${target.startsWith("merchant:") ? `?merchantId=${target.slice(9)}` : ""}`,
        )
      ).assessments,
    );
  }, [target]);
  useEffect(() => {
    void api<typeof options>("credit-assessments/merchants")
      .then(setOptions)
      .catch((e) => setError(e.message));
    void api<Record<string, unknown>>("credit-assessments/model")
      .then(setMetadata)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let cancelled = false;
    void api<{ assessments: StaffCreditAssessment[] }>(
      `credit-assessments${target.startsWith("merchant:") ? `?merchantId=${target.slice(9)}` : ""}`,
    )
      .then((r) => {
        if (!cancelled) setHistory(r.assessments);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [target]);
  async function run() {
    setBusy(true);
    setError("");
    const key = intent?.target === target ? intent.key : crypto.randomUUID();
    setIntent({ target, key });
    try {
      const body = target.startsWith("merchant:")
        ? { merchantId: target.slice(9) }
        : { exampleId: target.slice(8) };
      setSelected(
        await api<StaffCreditAssessment>("credit-assessments", {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify(body),
        }),
      );
      setIntent(null);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assessment failed");
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    setError("");
    try {
      setSelected(await api<StaffCreditAssessment>(`credit-assessments/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assessment unavailable");
    }
  }
  const previous = history.find((r) => r.id === comparison);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      <div>
        <p className="text-sm text-blue-700">Internal pilot</p>
        <h1 className="mt-1 text-3xl font-semibold">Credit assessments</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Review evidence and experimental model results. Synthetic examples
          demonstrate the calculation; they do not validate repayment
          predictions. These results are excluded from merchant screens and
          lender packages.
        </p>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <Card className="min-w-0">
        <CardHeader>
          <h2 className="font-semibold">Run an assessment</h2>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <label className="grid min-w-0 flex-1 gap-2 text-sm">
            Evidence source
            <select
              className="min-w-0 rounded-lg border bg-white p-3"
              disabled={busy}
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setSelected(null);
                setComparison("");
                setIntent(null);
              }}
            >
              {(options?.syntheticExamples ?? ["complete"]).map((id) => (
                <option key={id} value={`example:${id}`}>
                  Synthetic example · {id.replaceAll("-", " ")}
                </option>
              ))}
              {options?.merchants.map((m) => (
                <option key={m.id} value={`merchant:${m.id}`}>
                  {m.name} · enrolled merchant
                </option>
              ))}
            </select>
          </label>
          <Button disabled={busy || !options} onClick={() => void run()}>
            {busy ? "Assessing…" : "Run pilot assessment"}
          </Button>
          <p className="w-full text-xs text-slate-500">
            Real merchants appear only after operator enrollment and explicit
            merchant consent.
          </p>
        </CardContent>
      </Card>
      {selected ? (
        <Card className="min-w-0">
          <CardHeader>
            <div>
              <h2 className="font-semibold">
                {selected.synthetic
                  ? "Synthetic demonstration"
                  : "Merchant assessment"}
              </h2>
              <p className="mt-1 break-all text-xs text-slate-500">
                {selected.id} · {new Date(selected.createdAt).toLocaleString()}
              </p>
            </div>
          </CardHeader>
          <CardContent className="grid min-w-0 grid-cols-1 gap-6">
            <CreditResult credit={selected.result} showModelDetails />
            {selected.result.experimentalCredit ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
                <h3 className="font-semibold">Experimental credit risk</h3>
                <p className="my-2 text-sm">
                  {selected.result.experimentalCredit.disclaimer}
                </p>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    [
                      "Default probability",
                      `${(selected.result.experimentalCredit.probabilityOfDefault * 100).toFixed(2)}%`,
                    ],
                    [
                      "Statistical score",
                      selected.result.experimentalCredit.statisticalScore,
                    ],
                    [
                      "Policy bonus",
                      selected.result.experimentalCredit.policyOverlayPoints.toFixed(
                        1,
                      ),
                    ],
                    [
                      "Final score",
                      `${selected.result.experimentalCredit.creditScore} · ${selected.result.experimentalCredit.creditGrade}`,
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-slate-600">{label}</dt>
                      <dd className="mt-1 font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <Alert>
                Experimental credit score unavailable. Required inputs are
                missing.
              </Alert>
            )}
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Input snapshot and provenance
              </summary>
              <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-slate-100 p-4 text-xs">
                {JSON.stringify(selected.input, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      ) : null}
      <Card className="min-w-0">
        <CardHeader>
          <h2 className="font-semibold">Assessment history and comparison</h2>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2">
            {history.map((row) => (
              <li key={row.id}>
                <Button
                  variant="secondary"
                  className="h-auto w-full justify-start whitespace-normal break-words py-3 text-left sm:w-auto"
                  onClick={() => void open(row.id)}
                >
                  {new Date(row.createdAt).toLocaleString()} ·{" "}
                  {row.modelVersion}
                </Button>
              </li>
            ))}
          </ul>
          {!history.length ? (
            <p className="text-sm text-slate-500">
              No saved pilot assessments for this selection.
            </p>
          ) : null}
          {selected ? (
            <label className="mt-5 grid gap-2 text-sm">
              Compare with a saved result
              <select
                className="min-w-0 max-w-full rounded-lg border p-3"
                value={comparison}
                onChange={(e) => setComparison(e.target.value)}
              >
                <option value="">Choose assessment</option>
                {history
                  .filter((x) => x.id !== selected.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {new Date(x.createdAt).toLocaleString()} ·{" "}
                      {x.modelVersion}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          {previous && selected ? (
            <div className="mt-4 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">Result</th>
                    <th>Selected</th>
                    <th>Comparison</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Model", selected.modelVersion, previous.modelVersion],
                    [
                      "Financial profile",
                      selected.result.financialProfile?.score.toFixed(1),
                      previous.result.financialProfile?.score.toFixed(1),
                    ],
                    [
                      "Experimental score",
                      selected.result.experimentalCredit?.creditScore,
                      previous.result.experimentalCredit?.creditScore,
                    ],
                  ].map(([k, a, b]) => (
                    <tr key={k}>
                      <th className="p-2">{k}</th>
                      <td>{a ?? "Not available"}</td>
                      <td>{b ?? "Not available"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <details className="min-w-0 rounded-xl border bg-white p-5">
        <summary className="cursor-pointer font-medium">
          Model version and limitations
        </summary>
        <pre className="mt-4 max-h-96 overflow-auto text-xs">
          {metadata
            ? JSON.stringify(metadata, null, 2)
            : "Metadata unavailable; retry by reloading this page."}
        </pre>
      </details>
    </div>
  );
}
