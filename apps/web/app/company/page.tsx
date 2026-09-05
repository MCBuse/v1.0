import type { Metadata } from "next";
import { ArrowUpRight, Check } from "lucide-react";

import { CtaStrip } from "../../components/site/CtaStrip";
import { COMMUNICATION_PRINCIPLES } from "../../components/site/content";
import { Card, MonoEyebrow, Section, tertiaryLinkClass } from "../../components/site/primitives";
import { TEAM_MEMBERS, outboundProps } from "../../components/landing/constants";

export const metadata: Metadata = {
  title: "Company",
  description:
    "The cross-functional team building structured financial visibility for micro-merchants.",
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function CompanyPage() {
  return (
    <>
      <Section className="pb-8">
        <div className="max-w-3xl">
          <MonoEyebrow className="mb-5">Company</MonoEyebrow>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-text sm:text-5xl">
            Meet the team behind MCBuse
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted">
            MCBuse is built by a cross-functional team combining finance, IT, software engineering,
            marketing and growth.
          </p>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            We are building MCBuse to help micro-merchants turn everyday low-ticket activity into
            structured financial visibility — so a merchant can show what their business actually
            does, and an institution can verify it.
          </p>
        </div>
      </Section>

      <Section id="team" title="The team">
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {TEAM_MEMBERS.map((member) => (
            <Card key={member.name} as="li" className="flex flex-col p-8">
              {/* Monogram avatars — no team photography exists. See brand.md. */}
              <span
                aria-hidden
                className="inline-flex h-16 w-16 items-center justify-center border border-border-strong bg-accent-soft font-semibold text-accent"
              >
                {initials(member.name)}
              </span>
              <h3 className="mt-6 text-lg font-semibold tracking-[-0.015em] text-text">
                {member.name}
              </h3>
              <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-accent">
                {member.role}
              </p>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">{member.education}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-subtle">{member.experience}</p>
              {member.linkedin && (
                <a
                  href={member.linkedin}
                  {...outboundProps(member.linkedin)}
                  aria-label={`${member.name} on LinkedIn`}
                  className={`${tertiaryLinkClass} mt-6`}
                >
                  LinkedIn
                  <ArrowUpRight aria-hidden size={15} />
                </a>
              )}
            </Card>
          ))}
        </ul>
      </Section>

      <Section tone="ink" fullBleed>
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="text-3xl font-semibold leading-tight tracking-[-0.02em] text-text sm:text-4xl">
                How we talk about what we&rsquo;re building
              </h2>
            </div>
            <ul className="space-y-8 lg:col-span-7">
              {COMMUNICATION_PRINCIPLES.map((p) => (
                <li key={p.title} className="flex items-start gap-3">
                  <Check aria-hidden size={18} className="mt-1 shrink-0 text-accent" />
                  <div>
                    <p className="text-base font-medium text-text">{p.title}</p>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{p.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <CtaStrip
        title="Work with us"
        body="We&rsquo;re talking to merchants, partners and investors."
        primary={{ label: "Join the Pilot", href: "/contact#merchant-form" }}
        secondary={{ label: "Schedule a partner call", href: "/contact#partner-form" }}
      />
    </>
  );
}
