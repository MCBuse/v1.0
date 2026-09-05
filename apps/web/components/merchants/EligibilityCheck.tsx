"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

import {
  linkFocusClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../site/primitives";

type YesNo = "yes" | "no";
type City = "berlin" | "munich" | "germany" | "outside";

const QUESTIONS = [
  { key: "ticket", label: "Is your average sale between EUR 0.10 and EUR 10.00?" },
  { key: "volume", label: "Do you take many small payments on a typical day?" },
  { key: "nfc", label: "Do you have an NFC-capable smartphone or terminal?" },
] as const;

type QuestionKey = (typeof QUESTIONS)[number]["key"];

const CITIES: { value: City; label: string }[] = [
  { value: "berlin", label: "Berlin" },
  { value: "munich", label: "Munich" },
  { value: "germany", label: "Elsewhere in Germany" },
  { value: "outside", label: "Outside Germany" },
];

type Outcome = {
  tone: "success" | "warning" | "neutral";
  title: string;
  body: string;
  cta: { label: string; href: string };
  ctaStyle: "primary" | "secondary";
};

function evaluate(answers: Record<QuestionKey, YesNo>, city: City): Outcome {
  const inPilotCity = city === "berlin" || city === "munich";

  if (answers.ticket === "no" || answers.volume === "no") {
    return {
      tone: "neutral",
      title: "The pilot is built for very high-frequency, low-ticket sales.",
      body: "If that is not your pattern yet, the waitlist is still the right place — the product will widen over time.",
      cta: { label: "Join the waitlist", href: "/contact#waitlist-form" },
      ctaStyle: "secondary",
    };
  }

  if (answers.nfc === "no") {
    return {
      tone: "warning",
      title: "You will need an NFC-capable device to take part.",
      body: "Most recent smartphones and smart terminals qualify. Get in touch if you are not sure what you have.",
      cta: { label: "Ask us about hardware", href: "/contact#merchant-form" },
      ctaStyle: "secondary",
    };
  }

  if (!inPilotCity) {
    return {
      tone: "warning",
      title: "Your business fits — your city is not in the first pilot yet.",
      body: "We are starting in Berlin and Munich. Join the waitlist and we will tell you when we expand.",
      cta: { label: "Join the waitlist", href: "/contact#waitlist-form" },
      ctaStyle: "primary",
    };
  }

  return {
    tone: "success",
    title: "You look like a good fit for the Berlin and Munich pilot.",
    body: "The pilot focuses on high-frequency, low-ticket merchants in these two cities.",
    cta: { label: "Apply to the pilot", href: "/contact#merchant-form" },
    ctaStyle: "primary",
  };
}

const TONE_BORDER = {
  success: "border-success/40",
  warning: "border-warning/40",
  neutral: "border-border-strong",
} as const;

const TONE_TEXT = {
  success: "text-success",
  warning: "text-warning",
  neutral: "text-subtle",
} as const;

export function EligibilityCheck() {
  const [answers, setAnswers] = useState<Partial<Record<QuestionKey, YesNo>>>({});
  const [city, setCity] = useState<City | "">("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const resultHeading = useRef<HTMLParagraphElement>(null);

  const complete = QUESTIONS.every((q) => answers[q.key]) && city !== "";

  const setAnswer = (key: QuestionKey, value: YesNo) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setOutcome(null);
  };

  const handleCheck = () => {
    if (!complete) return;
    setOutcome(evaluate(answers as Record<QuestionKey, YesNo>, city as City));
    // Move focus to the result so it is announced and reachable.
    window.requestAnimationFrame(() => resultHeading.current?.focus());
  };

  const Icon =
    outcome?.tone === "success" ? CheckCircle2 : outcome?.tone === "warning" ? AlertCircle : Info;

  return (
    <div className="border border-border bg-surface p-8">
      <fieldset className="border-0 p-0">
        <legend className="sr-only">Pilot eligibility questions</legend>

        {QUESTIONS.map((q) => (
          <div
            key={q.key}
            className="flex flex-col gap-3 border-b border-border py-5 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          >
            <span className="text-[15px] leading-relaxed text-text">{q.label}</span>
            <div
              role="radiogroup"
              aria-label={q.label}
              className="flex shrink-0 gap-2"
            >
              {(["yes", "no"] as const).map((value) => {
                const selected = answers[q.key] === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAnswer(q.key, value)}
                    className={`inline-flex h-10 min-w-[4.5rem] items-center justify-center border px-4 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors duration-200 ${
                      selected
                        ? "border-action bg-action text-on-action"
                        : "border-border-strong text-muted hover:border-text hover:text-text"
                    } ${linkFocusClass}`}
                  >
                    {value === "yes" ? "Yes" : "No"}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="py-5">
          <label
            htmlFor="eligibility-city"
            className="block text-[15px] leading-relaxed text-text"
          >
            Where are you based?
          </label>
          <select
            id="eligibility-city"
            value={city}
            onChange={(e) => {
              setCity(e.target.value as City);
              setOutcome(null);
            }}
            className={`mt-3 h-12 w-full border border-border-strong bg-bg px-4 text-base text-text transition-colors duration-200 focus-visible:border-accent ${linkFocusClass}`}
          >
            <option value="">Choose an option</option>
            {CITIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <button
        type="button"
        onClick={handleCheck}
        disabled={!complete}
        aria-disabled={!complete}
        className={`${primaryButtonClass} mt-3 w-full disabled:cursor-not-allowed disabled:border-surface-2 disabled:bg-surface-2 disabled:text-subtle`}
      >
        {outcome ? "Check again" : "Check eligibility"}
      </button>

      {!complete && (
        <p className="mt-3 text-center text-[13px] text-subtle">
          Answer all three questions and choose a location to check.
        </p>
      )}

      <div aria-live="polite">
        {outcome && (
          <div className={`mt-6 border ${TONE_BORDER[outcome.tone]} bg-bg p-6`}>
            <div className="flex items-start gap-3">
              <Icon aria-hidden size={20} className={`mt-0.5 shrink-0 ${TONE_TEXT[outcome.tone]}`} />
              <div>
                <p
                  ref={resultHeading}
                  tabIndex={-1}
                  className={`text-lg font-semibold tracking-[-0.015em] text-text ${linkFocusClass}`}
                >
                  {outcome.title}
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{outcome.body}</p>
                <Link
                  href={outcome.cta.href}
                  className={`mt-6 ${
                    outcome.ctaStyle === "primary" ? primaryButtonClass : secondaryButtonClass
                  }`}
                >
                  {outcome.cta.label}
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="mt-5 text-center text-[13px] text-subtle">
        Nothing is stored. This check runs entirely in your browser.
      </p>
    </div>
  );
}
