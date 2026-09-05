import Link from "next/link";
import { Info } from "lucide-react";

import { EXTERNAL_LINKS, hasConfiguredUrl } from "../landing/constants";
import { BOUNDARY, HERO, HERO_STEPS } from "../site/content";
import {
  GridBackdrop,
  MonoEyebrow,
  primaryButtonClass,
  secondaryButtonClass,
} from "../site/primitives";
import { HeroPanel } from "./HeroPanel";

function StepStrip() {
  return (
    <ol className="mt-20 grid grid-cols-1 border border-border bg-surface md:grid-cols-3">
      {HERO_STEPS.map((step, i) => (
        <li
          key={step.title}
          className="flex items-baseline gap-4 border-b border-border p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
        >
          <span aria-hidden className="tabular font-mono text-sm text-accent">
            {`0${i + 1}`}
          </span>
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-text">{step.title}</p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-subtle">
              {step.detail}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Hero() {
  const demoIsLive = hasConfiguredUrl(EXTERNAL_LINKS.demoVideo);

  return (
    <section id="top" className="relative overflow-hidden px-5 pb-20 pt-16 sm:px-8 lg:pb-28 lg:pt-24">
      <GridBackdrop glow />

      <div className="mx-auto w-full max-w-6xl">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <MonoEyebrow dot>{HERO.eyebrow}</MonoEyebrow>

            <h1 className="mt-6 text-[2.5rem] font-bold leading-[1.05] tracking-[-0.03em] text-text sm:text-5xl lg:text-[3.5rem]">
              {HERO.headline.map((line) => (
                <span key={line} className="lg:block">
                  {line}{" "}
                </span>
              ))}
            </h1>

            <p className="mt-7 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              {HERO.body}
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/contact#merchant-form" className={`${primaryButtonClass} w-full sm:w-auto`}>
                Join the Pilot
              </Link>
              <Link href="/demo" className={`${secondaryButtonClass} w-full sm:w-auto`}>
                {demoIsLive ? "Watch the demo" : "See the sandbox"}
              </Link>
            </div>

            <p className="mt-8 flex max-w-lg items-start gap-2.5 text-sm leading-relaxed text-subtle">
              <Info aria-hidden size={15} className="mt-0.5 shrink-0" />
              <span>{BOUNDARY.b7}</span>
            </p>
          </div>

          <div className="flex justify-center lg:col-span-5 lg:justify-end">
            <HeroPanel />
          </div>
        </div>

        <StepStrip />
      </div>
    </section>
  );
}
