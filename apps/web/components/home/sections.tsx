import Link from "next/link";
import { ArrowRight, BarChart3, Building2, Check, Handshake, Lock, QrCode, ShieldCheck, Store } from "lucide-react";

import {
  AUDIENCES,
  BOUNDARY_COLUMNS,
  FLOW_STEPS,
  PROBLEMS,
  PROBLEM_QUOTE,
  SOLUTION_QUOTE,
  VALUE_SNAPSHOT,
} from "../site/content";
import { Card, MonoEyebrow, Section, tertiaryLinkClass } from "../site/primitives";

const AUDIENCE_ICONS = [Store, Building2] as const;
const FLOW_ICONS = [QrCode, BarChart3, ShieldCheck, Handshake] as const;

/* ── Band 2 ───────────────────────────────────────────────────── */

export function AudienceSplit() {
  return (
    <Section bordered>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {AUDIENCES.map((a, i) => {
          const Icon = AUDIENCE_ICONS[i] ?? Store;
          return (
            <Card key={a.href} interactive className="flex flex-col justify-between p-8">
              <div>
                <span
                  aria-hidden
                  className="inline-flex h-10 w-10 items-center justify-center border border-border bg-bg text-accent"
                >
                  <Icon size={18} />
                </span>
                <h2 className="mt-6 text-xl font-semibold tracking-[-0.015em] text-text">{a.title}</h2>
                <p className="mt-3 text-base leading-relaxed text-muted">{a.body}</p>
              </div>
              <Link href={a.href} className={`${tertiaryLinkClass} mt-8`}>
                {a.linkLabel}
                <ArrowRight aria-hidden size={16} />
              </Link>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}

/* ── Band 3 ───────────────────────────────────────────────────── */

export function Problem() {
  return (
    <Section tone="ink" fullBleed>
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <MonoEyebrow className="mb-4">The problem</MonoEyebrow>
        <h2 className="max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.02em] text-text sm:text-4xl">
          Micro-activity is real. The data is missing.
        </h2>

        <blockquote className="mt-10 border-l-2 border-accent pl-6">
          <p className="max-w-2xl text-xl italic leading-relaxed text-text sm:text-2xl">
            “{PROBLEM_QUOTE}”
          </p>
        </blockquote>

        <ul className="mt-16 border-t border-border">
          {PROBLEMS.map((p) => (
            <li
              key={p.n}
              className="grid grid-cols-1 gap-3 border-b border-border py-8 lg:grid-cols-12 lg:gap-8"
            >
              <span aria-hidden className="tabular font-mono text-sm text-subtle lg:col-span-1">
                {p.n}
              </span>
              <h3 className="text-lg font-semibold tracking-[-0.015em] text-text lg:col-span-5">
                {p.title}
              </h3>
              <p className="text-base leading-relaxed text-muted lg:col-span-6">{p.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

/* ── Band 4 ───────────────────────────────────────────────────── */

export function Solution() {
  return (
    <Section
      eyebrow="The solution"
      title="Payment data becomes merchant intelligence"
      intro="MCBuse captures QR, NFC and stablecoin payment events and converts them into structured merchant records. Those records power business analytics, credit-readiness indicators, and preparation for review by banks and financial institutions."
    >
      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FLOW_STEPS.map((step, i) => {
          const Icon = FLOW_ICONS[i] ?? QrCode;
          return (
            <li key={step.title}>
              <Link
                href={step.href}
                className="flex h-full flex-col border border-border bg-surface p-6 transition-colors duration-200 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <Icon aria-hidden size={22} className="text-accent" />
                <span className="mt-4 text-lg font-semibold tracking-[-0.015em] text-text">
                  {step.title}
                </span>
                <span className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-subtle">
                  {step.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      <blockquote className="mt-14 border-l-2 border-accent pl-6">
        <p className="max-w-3xl text-lg leading-relaxed text-text sm:text-xl">“{SOLUTION_QUOTE}”</p>
      </blockquote>
    </Section>
  );
}

/* ── Band 5 ───────────────────────────────────────────────────── */

export function ValueSnapshot() {
  return (
    <Section bordered title="Built for micro-retail operational growth">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {VALUE_SNAPSHOT.map((v) => (
          <Card key={v.title} className="flex flex-col p-8">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
              {v.label}
            </span>
            <p className="tabular mt-4 font-mono text-2xl font-medium tracking-[-0.01em] text-text">
              {v.figure}
            </p>
            <h3 className="mt-4 text-base font-semibold text-text">{v.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{v.body}</p>
          </Card>
        ))}
      </div>

      <Link href="/product" className={`${tertiaryLinkClass} mt-10`}>
        See the full product breakdown
        <ArrowRight aria-hidden size={16} />
      </Link>
    </Section>
  );
}

/* ── Band 6 ───────────────────────────────────────────────────── */

export function BoundaryBand() {
  return (
    <Section tone="ink" fullBleed>
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <h2 className="text-3xl font-semibold leading-tight tracking-[-0.02em] text-text sm:text-4xl">
          What MCBuse is, and what it isn&rsquo;t
        </h2>

        <div className="mt-14 grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-0">
          <div className="md:border-r md:border-border md:pr-12">
            <MonoEyebrow className="mb-6">MCBuse provides</MonoEyebrow>
            <ul className="space-y-4">
              {BOUNDARY_COLUMNS.provides.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check aria-hidden size={18} className="mt-1 shrink-0 text-accent" />
                  <span className="text-base leading-relaxed text-text">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:pl-12">
            <MonoEyebrow className="mb-6">Licensed partners handle</MonoEyebrow>
            <ul className="space-y-4">
              {BOUNDARY_COLUMNS.partners.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Lock aria-hidden size={18} className="mt-1 shrink-0 text-subtle" />
                  <span className="text-base leading-relaxed text-text">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Link href="/merchants#faq" className={`${tertiaryLinkClass} mt-14`}>
          Read the frequently asked questions
          <ArrowRight aria-hidden size={16} />
        </Link>
      </div>
    </Section>
  );
}
