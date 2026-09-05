"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { CONTACT_EMAIL } from "../landing/constants";
import {
  SEGMENTS,
  VALIDATION,
  isFreeEmail,
  isValidEmail,
  isValidPhone,
  type Field,
  type Segment,
} from "../site/formFields";
import { buildIntakeMailto } from "../site/submitIntake";
import { linkFocusClass, primaryButtonClass, tertiaryLinkClass } from "../site/primitives";

type Values = Record<string, string>;
type Errors = Record<string, string>;

const inputClass = `h-12 w-full border border-border-strong bg-bg px-4 text-base text-text placeholder:text-subtle transition-colors duration-200 focus-visible:border-accent ${linkFocusClass}`;

function validate(segment: Segment, values: Values, consent: boolean): Errors {
  const errors: Errors = {};

  for (const field of segment.fields) {
    const value = (values[field.name] ?? "").trim();

    if (field.required && value.length === 0) {
      errors[field.name] = field.type === "select" ? VALIDATION.select : VALIDATION.required;
      continue;
    }
    if (field.type === "email" && value.length > 0 && !isValidEmail(value)) {
      errors[field.name] = VALIDATION.email;
    }
    if (field.type === "tel" && !isValidPhone(value)) {
      errors[field.name] = VALIDATION.phone;
    }
  }

  if (!consent) errors.consent = VALIDATION.consent;

  return errors;
}

export function ContactForm() {
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Values>({});
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [sent, setSent] = useState(false);

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const successRef = useRef<HTMLHeadingElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const segment = SEGMENTS[index] as Segment;

  // Deep links: /contact#partner-form selects that segment and focuses it.
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    const found = SEGMENTS.findIndex((s) => s.hash === hash);
    if (found >= 0) {
      setIndex(found);
      window.requestAnimationFrame(() => firstFieldRef.current?.focus());
    }
  }, []);

  const selectSegment = useCallback((next: number) => {
    setIndex(next);
    setErrors({});
    setSent(false);
    const target = SEGMENTS[next];
    if (target) {
      window.history.replaceState(null, "", `#${target.hash}`);
    }
  }, []);

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = e.key === "ArrowRight" ? (i + 1) % SEGMENTS.length : (i - 1 + SEGMENTS.length) % SEGMENTS.length;
    selectSegment(next);
    tabRefs.current[next]?.focus();
  };

  const workEmailHint = useMemo(() => {
    if (segment.id !== "partner") return null;
    const email = values.email ?? "";
    return email.length > 0 && isValidEmail(email) && isFreeEmail(email) ? VALIDATION.workEmail : null;
  }, [segment.id, values.email]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(segment, values, consent);
    setErrors(found);

    if (Object.keys(found).length > 0) {
      const firstKey = Object.keys(found)[0];
      const el = document.getElementById(`field-${firstKey}`) ?? document.getElementById("consent");
      el?.focus();
      return;
    }

    const href = buildIntakeMailto({
      subject: segment.subject,
      fields: segment.fields.map((f) => ({ label: f.label, value: values[f.name] ?? "" })),
      consentText: segment.consent,
    });

    window.location.href = href;
    setSent(true);
    window.requestAnimationFrame(() => successRef.current?.focus());
  };

  if (sent) {
    return (
      <div aria-live="polite" className="border border-success/40 bg-surface p-8">
        <CheckCircle2 aria-hidden size={22} className="text-success" />
        <h2
          ref={successRef}
          tabIndex={-1}
          className={`mt-5 text-xl font-semibold tracking-[-0.015em] text-text ${linkFocusClass}`}
        >
          Your message is ready to send
        </h2>
        <p className="mt-3 text-base leading-relaxed text-muted">
          We have opened a pre-filled email in your mail app, including the consent you agreed to.
          Send it and we will reply within two working days. If nothing opened, email us directly at{" "}
          <span className="font-mono text-text">{CONTACT_EMAIL}</span>.
        </p>
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setConsent(false);
          }}
          className={`${tertiaryLinkClass} mt-6`}
        >
          Fill in another enquiry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div role="tablist" aria-label="Enquiry type" className="flex flex-col gap-2 sm:flex-row">
        {SEGMENTS.map((s, i) => {
          const active = i === index;
          return (
            <button
              key={s.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`tab-${s.id}`}
              aria-selected={active}
              aria-controls={`panel-${s.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => selectSegment(i)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={`inline-flex h-11 flex-1 items-center justify-center border px-4 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors duration-200 ${
                active
                  ? "border-action bg-action text-on-action"
                  : "border-border-strong text-muted hover:border-text hover:text-text"
              } ${linkFocusClass}`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <form
        id={`panel-${segment.id}`}
        role="tabpanel"
        aria-labelledby={`tab-${segment.id}`}
        onSubmit={handleSubmit}
        noValidate
        className="mt-6 border border-border bg-surface p-8"
      >
        <div className="space-y-6">
          {segment.fields.map((field, i) => (
            <FieldRow
              key={`${segment.id}-${field.name}`}
              field={field}
              value={values[field.name] ?? ""}
              error={errors[field.name]}
              hint={field.name === "email" ? workEmailHint : null}
              inputRef={i === 0 ? firstFieldRef : undefined}
              onChange={(v) => setValues((prev) => ({ ...prev, [field.name]: v }))}
            />
          ))}

          <div>
            <div className="flex items-start gap-3">
              <input
                id="consent"
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                aria-invalid={errors.consent ? true : undefined}
                aria-describedby={errors.consent ? "consent-error" : undefined}
                className={`mt-0.5 h-5 w-5 shrink-0 accent-accent ${linkFocusClass}`}
              />
              <label htmlFor="consent" className="text-[13px] leading-relaxed text-muted">
                {segment.consent}
              </label>
            </div>
            {errors.consent && (
              <p id="consent-error" className="mt-2 text-[13px] text-error">
                {errors.consent}
              </p>
            )}
          </div>

          <button type="submit" className={`${primaryButtonClass} w-full`}>
            {segment.submitLabel}
          </button>

          <p className="text-center text-[13px] leading-relaxed text-subtle">
            We reply within two working days. Or email{" "}
            <span className="font-mono">{CONTACT_EMAIL}</span> directly.
          </p>
        </div>
      </form>
    </div>
  );
}

function FieldRow({
  field,
  value,
  error,
  hint,
  inputRef,
  onChange,
}: {
  field: Field;
  value: string;
  error?: string;
  hint?: string | null;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onChange: (v: string) => void;
}) {
  const id = `field-${field.name}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const invalidClass = error ? "border-error" : "";

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-text">
        {field.label}
        {field.required && (
          <span aria-hidden className="ml-1 text-accent">
            *
          </span>
        )}
        {field.optional && <span className="ml-2 text-[13px] font-normal text-subtle">Optional</span>}
      </label>

      {field.type === "select" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-required={field.required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${inputClass} ${invalidClass}`}
        >
          <option value="">Choose an option</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          id={id}
          value={value}
          rows={4}
          onChange={(e) => onChange(e.target.value)}
          aria-required={field.required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full border border-border-strong bg-bg px-4 py-3 text-base text-text transition-colors duration-200 focus-visible:border-accent ${invalidClass} ${linkFocusClass}`}
        />
      ) : field.type === "yesno" ? (
        <div role="radiogroup" aria-label={field.label} id={id} className="flex gap-2">
          {["Yes", "No"].map((opt) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={value === opt}
              onClick={() => onChange(opt)}
              className={`inline-flex h-11 min-w-[5rem] items-center justify-center border px-4 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors duration-200 ${
                value === opt
                  ? "border-action bg-action text-on-action"
                  : "border-border-strong text-muted hover:border-text hover:text-text"
              } ${linkFocusClass}`}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <input
          id={id}
          ref={inputRef}
          type={field.type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-required={field.required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${inputClass} ${invalidClass}`}
        />
      )}

      {error && (
        <p id={`${id}-error`} className="mt-2 text-[13px] text-error">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${id}-hint`} className="mt-2 text-[13px] text-warning">
          {hint}
        </p>
      )}
    </div>
  );
}
