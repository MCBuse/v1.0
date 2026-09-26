"use client";
import { CREDIT_MONEY_FIELDS, type CreditProfile } from "@repo/shared";
import { Field, FieldLabel, Input } from "@repo/ui/field";
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

/** Reads the Additional Information fields; throws on an invalid amount. */
export function readCreditProfile(f: FormData): CreditProfile {
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
    externalBureauReport: String(f.get("externalBureauReport") ?? "") || null,
  };
  for (const k of CREDIT_MONEY_FIELDS)
    data[k] = creditMinorInput(String(f.get(k) ?? ""));
  return data;
}

/** True when two profiles would save the same declarations. */
export function sameCreditProfile(a: CreditProfile, b: CreditProfile) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<
    keyof CreditProfile
  >;
  return [...keys].every((k) => (a[k] ?? null) === (b[k] ?? null));
}

/**
 * Merchant-declared Additional Information: collateral, finance and owner
 * details. Rendered inside the caller's form; blank means "not provided".
 */
export function CreditProfileFields({ profile }: { profile: CreditProfile }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="credit-start">
          Business commencement date
        </FieldLabel>
        <Input
          type="date"
          id="credit-start"
          name="commencementDate"
          max={new Date().toISOString().slice(0, 10)}
          defaultValue={profile.commencementDate ?? ""}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="credit-category">Merchant category</FieldLabel>
        <select
          className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          id="credit-category"
          name="merchantType"
          defaultValue={profile.merchantType ?? ""}
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
            defaultValue={major(profile[k])}
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
          defaultValue={profile.loanTermMonths ?? ""}
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
          defaultValue={profile.externalBureauScore ?? ""}
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
          defaultValue={profile.externalBureauReport ?? ""}
          className="min-h-24 rounded-lg border border-slate-300 p-3 text-sm"
        />
      </Field>
    </div>
  );
}
