"use client";

import { useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { CONTACT_EMAIL } from "../landing/constants";
import { VALIDATION, isValidEmail } from "../site/formFields";
import { buildIntakeMailto } from "../site/submitIntake";
import { linkFocusClass, primaryButtonClass } from "../site/primitives";

const ROLES = ["Merchant", "Bank", "Fintech", "PSP", "Investor", "Developer", "Other"];

const CONSENT = "I agree to MCBuse contacting me about sandbox access.";

const inputClass = `h-12 w-full border border-border-strong bg-bg px-4 text-base text-text transition-colors duration-200 focus-visible:border-accent ${linkFocusClass}`;

export function AccessForm() {
  const [values, setValues] = useState({ name: "", email: "", org: "", role: "" });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const successRef = useRef<HTMLParagraphElement>(null);

  const set = (key: keyof typeof values) => (v: string) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!values.name.trim()) found.name = VALIDATION.required;
    if (!values.email.trim()) found.email = VALIDATION.required;
    else if (!isValidEmail(values.email)) found.email = VALIDATION.email;
    if (!values.org.trim()) found.org = VALIDATION.required;
    if (!values.role) found.role = VALIDATION.select;
    if (!consent) found.consent = VALIDATION.consent;

    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0];
      document.getElementById(`access-${first}`)?.focus();
      return;
    }

    window.location.href = buildIntakeMailto({
      subject: "MCBuse sandbox access request",
      fields: [
        { label: "Name", value: values.name },
        { label: "Work email", value: values.email },
        { label: "Organisation", value: values.org },
        { label: "I am a", value: values.role },
      ],
      consentText: CONSENT,
    });
    setSent(true);
    window.requestAnimationFrame(() => successRef.current?.focus());
  };

  if (sent) {
    return (
      <div aria-live="polite" className="border border-success/40 bg-surface p-8">
        <CheckCircle2 aria-hidden size={22} className="text-success" />
        <p
          ref={successRef}
          tabIndex={-1}
          className={`mt-5 text-lg font-semibold tracking-[-0.015em] text-text ${linkFocusClass}`}
        >
          Your request is ready to send
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          We have opened a pre-filled email in your mail app. Send it and we will follow up with
          credentials and a walkthrough. If nothing opened, email{" "}
          <span className="font-mono text-text">{CONTACT_EMAIL}</span>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="border border-border bg-surface p-8">
      <div className="space-y-6">
        {(
          [
            { key: "name", label: "Name", type: "text" },
            { key: "email", label: "Work email", type: "email" },
            { key: "org", label: "Organisation", type: "text" },
          ] as const
        ).map((f) => (
          <div key={f.key}>
            <label htmlFor={`access-${f.key}`} className="mb-2 block text-sm font-medium text-text">
              {f.label}
              <span aria-hidden className="ml-1 text-accent">
                *
              </span>
            </label>
            <input
              id={`access-${f.key}`}
              type={f.type}
              value={values[f.key]}
              onChange={(e) => set(f.key)(e.target.value)}
              aria-required
              aria-invalid={errors[f.key] ? true : undefined}
              aria-describedby={errors[f.key] ? `access-${f.key}-error` : undefined}
              className={`${inputClass} ${errors[f.key] ? "border-error" : ""}`}
            />
            {errors[f.key] && (
              <p id={`access-${f.key}-error`} className="mt-2 text-[13px] text-error">
                {errors[f.key]}
              </p>
            )}
          </div>
        ))}

        <div>
          <label htmlFor="access-role" className="mb-2 block text-sm font-medium text-text">
            I am a
            <span aria-hidden className="ml-1 text-accent">
              *
            </span>
          </label>
          <select
            id="access-role"
            value={values.role}
            onChange={(e) => set("role")(e.target.value)}
            aria-required
            aria-invalid={errors.role ? true : undefined}
            aria-describedby={errors.role ? "access-role-error" : undefined}
            className={`${inputClass} ${errors.role ? "border-error" : ""}`}
          >
            <option value="">Choose an option</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {errors.role && (
            <p id="access-role-error" className="mt-2 text-[13px] text-error">
              {errors.role}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-start gap-3">
            <input
              id="access-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-invalid={errors.consent ? true : undefined}
              aria-describedby={errors.consent ? "access-consent-error" : undefined}
              className={`mt-0.5 h-5 w-5 shrink-0 accent-accent ${linkFocusClass}`}
            />
            <label htmlFor="access-consent" className="text-[13px] leading-relaxed text-muted">
              {CONSENT}
            </label>
          </div>
          {errors.consent && (
            <p id="access-consent-error" className="mt-2 text-[13px] text-error">
              {errors.consent}
            </p>
          )}
        </div>

        <button type="submit" className={`${primaryButtonClass} w-full`}>
          Request access
        </button>
      </div>
    </form>
  );
}
