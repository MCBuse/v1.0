"use client";
import { CREDIT_MONEY_FIELDS, type CreditProfile } from "@repo/shared";
import { useState } from "react";
import { Field, FieldLabel, Input } from "@repo/ui/field";
import { AvailabilityBar, StatusIcon } from "@/components/assessment-status";
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

const FIELD_NAMES = [
  "commencementDate",
  "merchantType",
  ...CREDIT_MONEY_FIELDS,
  "loanTermMonths",
  "externalBureauScore",
  "externalBureauReport",
] as const;
type FieldName = (typeof FIELD_NAMES)[number];

function initialFilled(profile: CreditProfile): Record<FieldName, boolean> {
  const out = {} as Record<FieldName, boolean>;
  for (const name of FIELD_NAMES) {
    const value = profile[name as keyof CreditProfile];
    out[name] =
      value !== null && value !== undefined && String(value).trim() !== "";
  }
  return out;
}

/** "Added" in green or "Missing" in amber, next to each field's label. */
function FieldStatus({ filled }: { filled: boolean }) {
  return filled ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
      <StatusIcon status="available" className="size-4" /> Added
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
      <StatusIcon status="declare" className="size-4" /> Missing
    </span>
  );
}

function LabelRow({
  htmlFor,
  children,
  filled,
}: {
  htmlFor: string;
  children: React.ReactNode;
  filled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <FieldLabel htmlFor={htmlFor}>{children}</FieldLabel>
      <FieldStatus filled={filled} />
    </div>
  );
}

const EMPTY = "border-amber-300 bg-amber-50/50";

/**
 * Merchant-declared Additional Information: collateral, finance and owner
 * details. Rendered inside the caller's form; blank means "not provided".
 * Each field shows whether it has been added, and the header counts them.
 */
export function CreditProfileFields({ profile }: { profile: CreditProfile }) {
  const [filled, setFilled] = useState(() => initialFilled(profile));
  const added = FIELD_NAMES.filter((name) => filled[name]).length;
  const cls = (name: FieldName, base = "") =>
    `${base} ${filled[name] ? "" : EMPTY}`.trim();
  return (
    <div
      className="grid gap-5"
      onChange={(event) => {
        const target = event.target as
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement;
        if ((FIELD_NAMES as readonly string[]).includes(target.name))
          setFilled((current) => ({
            ...current,
            [target.name]: target.value.trim() !== "",
          }));
      }}
    >
      <AvailabilityBar
        counts={{ available: added, declare: FIELD_NAMES.length - added }}
        label="Your details"
        noun="added"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <LabelRow htmlFor="credit-start" filled={filled.commencementDate}>
            Business commencement date
          </LabelRow>
          <Input
            type="date"
            id="credit-start"
            name="commencementDate"
            max={new Date().toISOString().slice(0, 10)}
            defaultValue={profile.commencementDate ?? ""}
            className={cls("commencementDate")}
          />
        </Field>
        <Field>
          <LabelRow htmlFor="credit-category" filled={filled.merchantType}>
            Merchant category
          </LabelRow>
          <select
            className={cls(
              "merchantType",
              "h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm",
            )}
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
            <LabelRow htmlFor={k} filled={filled[k]}>
              {labels[k]} (EUR)
            </LabelRow>
            <Input
              id={k}
              name={k}
              inputMode="decimal"
              defaultValue={major(profile[k])}
              placeholder="Not provided"
              maxLength={17}
              className={cls(k)}
            />
          </Field>
        ))}
        <Field>
          <LabelRow htmlFor="credit-term" filled={filled.loanTermMonths}>
            Requested loan term (months)
          </LabelRow>
          <Input
            id="credit-term"
            name="loanTermMonths"
            type="number"
            min={0}
            max={600}
            step={1}
            defaultValue={profile.loanTermMonths ?? ""}
            className={cls("loanTermMonths")}
          />
        </Field>
        <Field>
          <LabelRow htmlFor="credit-bureau" filled={filled.externalBureauScore}>
            External bureau score (original scale)
          </LabelRow>
          <Input
            id="credit-bureau"
            name="externalBureauScore"
            type="number"
            min={0}
            max={1000000}
            step={1}
            defaultValue={profile.externalBureauScore ?? ""}
            className={cls("externalBureauScore")}
          />
        </Field>
        <Field className="sm:col-span-2">
          <LabelRow
            htmlFor="credit-report"
            filled={filled.externalBureauReport}
          >
            Bureau name, score scale, and report notes
          </LabelRow>
          <textarea
            id="credit-report"
            name="externalBureauReport"
            maxLength={2000}
            defaultValue={profile.externalBureauReport ?? ""}
            className={cls(
              "externalBureauReport",
              "min-h-24 rounded-lg border border-slate-300 p-3 text-sm",
            )}
          />
        </Field>
      </div>
    </div>
  );
}
