import type { Metadata } from "next";
import { AlertTriangle, Play } from "lucide-react";

import { AccessForm } from "../../components/demo/AccessForm";
import { BOUNDARY, SANDBOX_ITEMS } from "../../components/site/content";
import {
  MonoEyebrow,
  Section,
  StatusChip,
  secondaryButtonClass,
} from "../../components/site/primitives";
import {
  EXTERNAL_LINKS,
  hasConfiguredUrl,
  linkOrRequestAccess,
  outboundProps,
} from "../../components/landing/constants";

export const metadata: Metadata = {
  title: "Sandbox Demo",
  description:
    "Test data-capture parameters and dashboard alerts against simulated transaction feeds in the MCBuse sandbox.",
};

function VideoCard() {
  const hasVideo = hasConfiguredUrl(EXTERNAL_LINKS.demoVideo);
  const requestHref = linkOrRequestAccess(EXTERNAL_LINKS.demoVideo, "MCBuse demo video request");

  return (
    <div className="border border-border bg-surface">
      <div className="relative flex aspect-video items-center justify-center border-b border-border bg-bg">
        <div aria-hidden className="grid-backdrop absolute inset-0" />
        {hasVideo ? (
          <a
            href={EXTERNAL_LINKS.demoVideo}
            {...outboundProps(EXTERNAL_LINKS.demoVideo)}
            className="relative inline-flex h-16 w-16 items-center justify-center border border-accent bg-bg text-accent transition-colors duration-200 hover:bg-accent hover:text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            aria-label="Play the MCBuse product walkthrough"
          >
            <Play aria-hidden size={22} />
          </a>
        ) : (
          <div className="relative px-6 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
              Not yet recorded
            </p>
            <a href={requestHref} {...outboundProps(requestHref)} className={`${secondaryButtonClass} mt-5`}>
              Request the demo video
            </a>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <h2 className="text-base font-semibold text-text">Product walkthrough</h2>
        <a
          href={linkOrRequestAccess(EXTERNAL_LINKS.pitchVideo, "MCBuse pitch video request")}
          {...outboundProps(linkOrRequestAccess(EXTERNAL_LINKS.pitchVideo, "MCBuse pitch video request"))}
          className="font-mono text-[12px] uppercase tracking-[0.08em] text-accent transition-colors duration-200 hover:text-accent-hover"
        >
          Pitch video →
        </a>
      </div>
    </div>
  );
}

export default function DemoPage() {
  const apkHref = linkOrRequestAccess(EXTERNAL_LINKS.apk, "MCBuse prototype build request");

  return (
    <>
      <Section id="sandbox" className="pb-8">
        <div className="max-w-3xl">
          <MonoEyebrow className="mb-5">Sandbox</MonoEyebrow>
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-text sm:text-5xl">
              Explore the MCBuse sandbox
            </h1>
            <StatusChip tone="warning" dot>
              Sandbox · Simulated data
            </StatusChip>
          </div>
          <p className="mt-6 text-lg leading-relaxed text-muted">
            Test data-capture parameters and dashboard alerts against simulated transaction feeds. A
            non-regulated, purely technical simulation environment.
          </p>
        </div>
      </Section>

      <Section className="pt-0">
        <VideoCard />
      </Section>

      <Section tone="ink" fullBleed>
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <h2 className="mb-12 text-3xl font-semibold leading-tight tracking-[-0.02em] text-text sm:text-4xl">
            What you can try
          </h2>
          <ul className="border-t border-border">
            {SANDBOX_ITEMS.map((item) => (
              <li
                key={item.n}
                className="grid grid-cols-1 gap-2 border-b border-border py-6 lg:grid-cols-12 lg:gap-8"
              >
                <span aria-hidden className="tabular font-mono text-sm text-subtle lg:col-span-1">
                  {item.n}
                </span>
                <h3 className="text-lg font-semibold tracking-[-0.015em] text-text lg:col-span-4">
                  {item.title}
                </h3>
                <p className="text-base leading-relaxed text-muted lg:col-span-7">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section id="access" bordered>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 className="text-3xl font-semibold leading-tight tracking-[-0.02em] text-text sm:text-4xl">
              Request sandbox access
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              Tell us who you are and we will send credentials and a guided walkthrough.
            </p>
            <div className="mt-10">
              <AccessForm />
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="border border-border bg-surface p-8">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-warning">
                Android · Prototype
              </p>
              <h3 className="mt-4 text-lg font-semibold tracking-[-0.015em] text-text">
                Prototype build
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                A test build is available to sandbox participants on request. It is a prototype, not
                a production release.
              </p>
              <a href={apkHref} {...outboundProps(apkHref)} className={`${secondaryButtonClass} mt-6 w-full`}>
                Request the test build
              </a>
              <p className="mt-4 text-[13px] leading-relaxed text-subtle">
                Request the build rather than downloading it directly, so we can share the current
                version and its known limitations.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section className="pt-0">
        <div className="flex items-start gap-3 border border-warning/40 bg-warning-soft p-6">
          <AlertTriangle aria-hidden size={20} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-base leading-relaxed text-text">{BOUNDARY.b6}</p>
        </div>
      </Section>
    </>
  );
}
