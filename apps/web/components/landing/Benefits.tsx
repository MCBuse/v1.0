import type { ReactNode } from "react";
import { Section } from "./Section";

const benefits: Array<{ icon: ReactNode; title: string; body: string }> = [
  {
    icon: <IconQr />,
    title: "Capture QR & NFC payments",
    body: "One tap or one scan. Both are recorded the same way, in the same place.",
  },
  {
    icon: <IconCoins />,
    title: "See daily sales & expected payouts",
    body: "Know what you took today and when it will land in your account.",
  },
  {
    icon: <IconAlert />,
    title: "Detect delayed or missing payouts",
    body: "Exceptions are surfaced the moment they happen — not days later.",
  },
  {
    icon: <IconChart />,
    title: "Understand your sales rhythm",
    body: "See your busiest hours and days at a glance. No spreadsheets.",
  },
  {
    icon: <IconLightning />,
    title: "Stay simple — no heavy POS",
    body: "Works with the tools you already have. No new hardware required.",
  },
];

export function Benefits() {
  return (
    <Section eyebrow="What you get" title="Built for the operations of a small shop.">
      <div className="grid gap-px bg-border md:grid-cols-2">
        {benefits.map((b, i) => (
          <div
            key={b.title}
            className={`flex items-start gap-5 bg-bg p-7 transition-colors hover:bg-surface ${
              i === benefits.length - 1 && benefits.length % 2 !== 0
                ? "md:col-span-2"
                : ""
            }`}
          >
            <div className="mt-0.5 shrink-0 text-muted">{b.icon}</div>
            <div>
              <h3 className="text-[15px] font-semibold text-text">{b.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
                {b.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function IconQr() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3M21 14v3M14 21h3M21 17v4" />
    </svg>
  );
}

function IconCoins() {
  return (
    <svg {...iconProps}>
      <ellipse cx="8" cy="8" rx="5" ry="2.5" />
      <path d="M3 8v3c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V8" />
      <ellipse cx="16" cy="15" rx="5" ry="2.5" />
      <path d="M11 15v3c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-3" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg {...iconProps}>
      <path d="M12 3 2.5 19a1 1 0 0 0 .9 1.5h17.2a1 1 0 0 0 .9-1.5L12 3Z" />
      <path d="M12 10v4M12 17.5v.01" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg {...iconProps}>
      <path d="M3 3v18h18" />
      <rect x="7" y="13" width="3" height="5" />
      <rect x="12" y="9" width="3" height="9" />
      <rect x="17" y="5" width="3" height="13" />
    </svg>
  );
}

function IconLightning() {
  return (
    <svg {...iconProps}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  );
}
