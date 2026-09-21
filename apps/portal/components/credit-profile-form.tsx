"use client";
import { useState } from "react";
import {
  CREDIT_MONEY_FIELDS,
  type CreditProfile,
  type MerchantConsent,
} from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Field, FieldLabel, Input } from "@repo/ui/field";
import { portalApi } from "@/lib/client/api";
import { usePortalResource } from "@/lib/client/use-portal-resource";
const labels: Record<(typeof CREDIT_MONEY_FIELDS)[number], string> = {
  existingDebtMinor: "Existing debt used for debt-to-sales",
  loanAmountMinor: "Requested loan amount",
  inventoryValueMinor: "Declared inventory value",
  collateralValueMinor: "Declared collateral value",
  businessDebtsMinor: "Business debts for lender review",
  businessAssetsMinor: "Business assets",
  ownerPersonalAssetsMinor: "Owner personal assets",
  ownerPersonalDebtsMinor: "Owner personal debts",
};
function major(value: string | null | undefined) {
  if (value == null) return "";
  const n = BigInt(value);
  return `${n / 100n}.${(n % 100n).toString().padStart(2, "0")}`;
}
export function creditMinorInput(value: string) {
  if (!value.trim()) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error(
      "Enter non-negative EUR amounts with at most two decimal places.",
    );
  const [whole = "0", decimal = ""] = value.split(".");
  return (BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"))).toString();
}
export function CreditProfileForm() {
  const profile = usePortalResource<CreditProfile>("me/credit-profile");
  const consent = usePortalResource<MerchantConsent>("me/credit-pilot-consent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    const f = new FormData(event.currentTarget);
    try {
      const data: CreditProfile = {
        commencementDate: String(f.get("commencementDate") ?? "") || null,
        merchantType: (String(f.get("merchantType") ?? "") ||
          null) as CreditProfile["merchantType"],
        loanTermMonths: f.get("loanTermMonths")
          ? Number(f.get("loanTermMonths"))
          : null,
        externalBureauScore: f.get("externalBureauScore")
          ? Number(f.get("externalBureauScore"))
          : null,
        externalBureauReport:
          String(f.get("externalBureauReport") ?? "") || null,
      };
      for (const k of CREDIT_MONEY_FIELDS)
        data[k] = creditMinorInput(String(f.get(k) ?? ""));
      await portalApi("me/credit-profile", {
        method: "PATCH",
        body: JSON.stringify({ data }),
      });
      await profile.refresh();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  }
  async function changeConsent() {
    setBusy(true);
    setError("");
    try {
      await portalApi("me/credit-pilot-consent", {
        method: "POST",
        body: JSON.stringify({ active: !consent.data?.active }),
      });
      await consent.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save consent");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="font-semibold">Credit profile and pilot consent</h2>
          <p className="mt-2 text-sm text-slate-500">
            These details are merchant declarations. Inventory, collateral,
            assets, and bureau information are retained for lender review.
            Verified supplier spending is not connected, so verified margin
            remains unavailable.
          </p>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6">
        {error || profile.error || consent.error ? (
          <Alert>
            {error || profile.error?.message || consent.error?.message}
          </Alert>
        ) : null}
        {saved ? (
          <p role="status" className="text-sm text-emerald-700">
            Credit profile saved. Run a new assessment to capture these changes.
          </p>
        ) : null}
        {profile.data ? (
          <form
            onSubmit={(e) => void save(e)}
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field>
              <FieldLabel htmlFor="credit-start">
                Business commencement date
              </FieldLabel>
              <Input
                type="date"
                id="credit-start"
                name="commencementDate"
                max={new Date().toISOString().slice(0, 10)}
                defaultValue={profile.data.commencementDate ?? ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="credit-category">
                Merchant category
              </FieldLabel>
              <select
                className="rounded-lg border bg-white p-3 text-sm"
                id="credit-category"
                name="merchantType"
                defaultValue={profile.data.merchantType ?? ""}
              >
                <option value="">Not provided / category not covered</option>
                <option value="cafe_bakery">Cafe or bakery</option>
                <option value="grocer">Grocer</option>
                <option value="kiosk">Kiosk</option>
                <option value="takeaway">Takeaway</option>
              </select>
            </Field>
            {CREDIT_MONEY_FIELDS.map((k) => (
              <Field key={k}>
                <FieldLabel htmlFor={k}>{labels[k]} (EUR)</FieldLabel>
                <Input
                  id={k}
                  name={k}
                  inputMode="decimal"
                  defaultValue={major(profile.data?.[k])}
                  placeholder="Not provided"
                  maxLength={17}
                />
              </Field>
            ))}
            <Field>
              <FieldLabel htmlFor="credit-term">
                Requested loan term (months)
              </FieldLabel>
              <Input
                id="credit-term"
                name="loanTermMonths"
                type="number"
                min={0}
                max={600}
                step={1}
                defaultValue={profile.data.loanTermMonths ?? ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="credit-bureau">
                External bureau score (original scale)
              </FieldLabel>
              <Input
                id="credit-bureau"
                name="externalBureauScore"
                type="number"
                min={0}
                max={1000000}
                step={1}
                defaultValue={profile.data.externalBureauScore ?? ""}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="credit-report">
                Bureau name, score scale, and report notes
              </FieldLabel>
              <textarea
                id="credit-report"
                name="externalBureauReport"
                maxLength={2000}
                defaultValue={profile.data.externalBureauReport ?? ""}
                className="min-h-24 rounded-lg border p-3 text-sm"
              />
            </Field>
            <Button disabled={busy} type="submit">
              {busy ? "Saving…" : "Save credit profile"}
            </Button>
          </form>
        ) : (
          <p className="text-sm">
            {profile.loading
              ? "Loading credit profile…"
              : "Credit profile unavailable."}
          </p>
        )}
        <div className="border-t pt-5">
          <h3 className="font-medium">
            Internal experimental assessment consent
          </h3>
          <p className="my-3 text-sm leading-6 text-slate-600">
            Allow authorized MCBuse credit analysts to review your business
            evidence and declared credit profile in the internal experimental
            scoring pilot. The model uses synthetic training data and does not
            make lending decisions. You can withdraw consent here; withdrawal
            blocks further staff access but does not erase retained audit
            records.
          </p>
          <p className="mb-3 text-sm">
            Consent: {consent.data?.active ? "Active" : "Not active"}
          </p>
          <Button
            variant="secondary"
            disabled={busy || !consent.data}
            onClick={() => void changeConsent()}
          >
            {consent.data?.active
              ? "Withdraw pilot consent"
              : "Give pilot consent"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
