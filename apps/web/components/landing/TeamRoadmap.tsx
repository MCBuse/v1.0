import { ArrowRight, ExternalLink, UserRound } from "lucide-react";
import { TEAM_MEMBERS } from "./constants";
import { linkFocusClass, secondaryButtonClass, Section } from "./Section";

const roadmap = [
  {
    quarter: "Q1",
    title: "Sandbox & Demo Validation",
    body: "Pitch video, demo video, APK test build, and hackathon feedback.",
  },
  {
    quarter: "Q2",
    title: "MVP Development",
    body: "Merchant onboarding, QR/NFC payment flow, transaction capture, and dashboard prototype.",
  },
  {
    quarter: "Q3",
    title: "Pilot Preparation",
    body: "Merchant interviews, partner discussions, compliance review, and Berlin/Munich pilot setup.",
  },
  {
    quarter: "Q4",
    title: "Market Launch Preparation",
    body: "Pilot launch preparation, product iteration, partner integrations, investor and grant follow-up.",
  },
];

export function TeamAndRoadmap() {
  return (
    <Section
      id="about"
      tone="surface"
      eyebrow="About the team"
      title="Founded by a Cross-Functional Team"
      intro="MCBuse is led by a team combining finance, IT, software engineering, marketing, and growth experience."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {TEAM_MEMBERS.map((member) => (
          <article
            key={member.name}
            className="rounded-lg border border-border bg-bg p-5"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
              <UserRound aria-hidden size={26} />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-text">
              {member.name}
            </h3>
            <p className="mt-1 text-sm font-semibold text-accent">
              {member.role}
            </p>
            <p className="mt-4 text-sm leading-6 text-muted">
              {member.education}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Experience: {member.experience}
            </p>
            {member.linkedin && (
              <a
                href={member.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-semibold text-muted transition-colors hover:text-accent ${linkFocusClass}`}
              >
                <ExternalLink aria-hidden size={16} />
                LinkedIn
              </a>
            )}
          </article>
        ))}
      </div>

      <div className="mt-16">
        <div className="mb-8 max-w-3xl">
          <p className="text-xs font-semibold uppercase text-accent">Roadmap</p>
          <h3 className="mt-3 text-3xl font-semibold leading-tight text-text sm:text-4xl">
            What We Are Building This Year
          </h3>
        </div>

        <ol className="grid gap-4 lg:grid-cols-4">
          {roadmap.map((item) => (
            <li
              key={item.quarter}
              className="rounded-lg border border-border bg-bg p-5"
            >
              <span className="font-mono text-2xl font-semibold text-accent">
                {item.quarter}
              </span>
              <h4 className="mt-4 text-base font-semibold text-text">
                {item.title}
              </h4>
              <p className="mt-3 text-sm leading-6 text-muted">{item.body}</p>
            </li>
          ))}
        </ol>

        <a href="#contact" className={`mt-7 ${secondaryButtonClass}`}>
          Join the Waitlist
          <ArrowRight aria-hidden size={16} />
        </a>
      </div>
    </Section>
  );
}
