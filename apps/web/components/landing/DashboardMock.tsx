import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Building2,
  CheckCircle2,
  Clock3,
  Database,
  FileCheck2,
  Fingerprint,
  HandCoins,
  Landmark,
  Link2,
  MapPin,
  Nfc,
  Play,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  Store,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { secondaryButtonClass } from "./Section";

type Tone = "success" | "warning" | "info";

const toneClass: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-accent-soft text-accent",
};

export function StatusPill({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

export function HeroProductVisual() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <MobilePaymentMock />
      <ActivityDashboardMock />
    </div>
  );
}

export function MobilePaymentMock() {
  return (
    <div className="mx-auto flex min-h-96 w-full max-w-xs flex-col rounded-2xl border border-border-strong bg-navy p-4 text-surface">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">MCBuse Pay</span>
        <StatusPill tone="success">Sandbox</StatusPill>
      </div>

      <div className="mt-7 rounded-lg bg-surface p-4 text-text">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Kiosk checkout</p>
            <p className="mt-1 text-xs text-muted">Low-ticket payment</p>
          </div>
          <Store aria-hidden className="text-accent" size={22} />
        </div>
        <p className="mt-6 font-mono text-3xl font-semibold text-text">€6.20</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-accent-soft p-3 text-center">
            <QrCode aria-hidden className="mx-auto text-accent" size={28} />
            <p className="mt-2 text-xs font-semibold text-text">QR</p>
          </div>
          <div className="rounded-lg border border-border bg-accent-soft p-3 text-center">
            <Nfc aria-hidden className="mx-auto text-accent" size={28} />
            <p className="mt-2 text-xs font-semibold text-text">NFC</p>
          </div>
        </div>
      </div>

      <div className="mt-auto space-y-3 pt-5">
        <PhoneRow icon={ReceiptText} label="Activity record" value="Created" />
        <PhoneRow icon={ShieldCheck} label="Data status" value="Verifiable" />
        <PhoneRow icon={Clock3} label="Timestamp" value="14:18 CET" />
      </div>
    </div>
  );
}

function PhoneRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ReceiptText;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-navy-soft px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-sm text-border">
        <Icon aria-hidden size={16} />
        {label}
      </span>
      <span className="shrink-0 text-sm font-semibold text-surface">{value}</span>
    </div>
  );
}

export function ActivityDashboardMock() {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-text">Merchant activity</p>
          <p className="mt-1 text-xs text-muted">Structured records</p>
        </div>
        <StatusPill tone="info">Demo data</StatusPill>
      </div>

      <div className="grid grid-cols-2 border-b border-border">
        <Metric label="Payments" value="42" />
        <Metric label="Activity value" value="€1,284" />
      </div>

      <div>
        <ActivityRow
          title="QR payment"
          meta="Bakery · Berlin"
          amount="€8.40"
          tone="success"
        />
        <ActivityRow
          title="NFC tap"
          meta="Cafe · Munich"
          amount="€4.80"
          tone="success"
        />
        <ActivityRow
          title="Payout review"
          meta="Kiosk · Berlin"
          amount="€42.00"
          tone="warning"
        />
        <ActivityRow
          title="P2P activity"
          meta="Wallet event"
          amount="€18.00"
          tone="info"
        />
      </div>

      <div className="border-t border-border bg-accent-soft px-4 py-3">
        <p className="text-sm font-semibold text-text">
          Financial visibility record updated
        </p>
        <p className="mt-1 text-xs text-muted">
          Amount, timestamp, status, merchant ID, and activity type captured.
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-border px-4 py-4 last:border-r-0">
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold text-text">{value}</p>
    </div>
  );
}

function ActivityRow({
  title,
  meta,
  amount,
  tone,
}: {
  title: string;
  meta: string;
  amount: string;
  tone: Tone;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-text">{title}</p>
        <p className="mt-1 truncate text-xs text-muted">{meta}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span
          aria-hidden
          className={`h-2 w-2 rounded-full ${
            tone === "success"
              ? "bg-success"
              : tone === "warning"
                ? "bg-warning"
                : "bg-accent"
          }`}
        />
        <span className="font-mono text-sm font-semibold text-text">
          {amount}
        </span>
      </div>
    </div>
  );
}

export function IcebergVisual() {
  const visible = [
    "Formal banking",
    "Structured records",
    "Verified data",
  ];
  const hidden = [
    "Cash transactions",
    "Informal lending",
    "Low-ticket purchases",
    "Underbanked users",
    "Micro-merchants",
    "Gig workers",
    "Data poverty",
  ];

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="rounded-lg border border-border bg-bg p-4">
        <p className="text-sm font-semibold text-text">Visible economy</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {visible.map((item) => (
            <span
              key={item}
              className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-border-strong" />
        <span className="text-xs font-semibold text-muted">
          everyday activity below the surface
        </span>
        <div className="h-px flex-1 bg-border-strong" />
      </div>

      <div className="rounded-lg bg-accent-soft p-4">
        <p className="text-sm font-semibold text-text">Invisible economy</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {hidden.map((item) => (
            <span
              key={item}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CaptureFlowVisual() {
  const steps = [
    { icon: Smartphone, title: "Activity", body: "QR, NFC, P2P, merchant events" },
    { icon: Database, title: "Capture layer", body: "Amount, time, party, channel" },
    { icon: FileCheck2, title: "Activity record", body: "Clean financial history" },
    { icon: UsersRound, title: "Activation", body: "Insights, signals, matching" },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-4">
      {steps.map((step, index) => (
        <div key={step.title} className="relative rounded-lg border border-border bg-surface p-5">
          <step.icon aria-hidden className="text-accent" size={24} />
          <p className="mt-4 text-base font-semibold text-text">{step.title}</p>
          <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
          {index < steps.length - 1 && (
            <ArrowRight
              aria-hidden
              className="absolute right-4 top-5 hidden text-border-strong lg:block"
              size={18}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function ProductStackVisual() {
  const layers = [
    {
      title: "Financial access",
      body: "Partner matching, future credit readiness, service discovery",
      icon: Landmark,
    },
    {
      title: "Data intelligence",
      body: "Activity profiles, payout visibility, behavioral signals",
      icon: BadgeCheck,
    },
    {
      title: "Transaction capture",
      body: "QR/NFC payments, P2P activity, merchant events",
      icon: HandCoins,
    },
  ];

  return (
    <div className="space-y-3">
      {layers.map((layer) => (
        <div
          key={layer.title}
          className="flex items-start gap-4 rounded-lg border border-border bg-surface p-5"
        >
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <layer.icon aria-hidden size={22} />
          </span>
          <div>
            <p className="text-base font-semibold text-text">{layer.title}</p>
            <p className="mt-1 text-sm leading-6 text-muted">{layer.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SandboxPreview({
  pitchHref,
  demoHref,
  apkHref,
  pitchLabel,
  demoLabel,
  apkLabel,
}: {
  pitchHref: string;
  demoHref: string;
  apkHref: string;
  pitchLabel: string;
  demoLabel: string;
  apkLabel: string;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex min-h-80 flex-col justify-between rounded-lg border border-border bg-navy p-6 text-surface">
        <div>
          <StatusPill tone="warning">Sandbox Demo</StatusPill>
          <h3 className="mt-5 max-w-lg text-2xl font-semibold leading-tight sm:text-3xl">
            Basic payment flow and activity record preview.
          </h3>
          <p className="mt-4 max-w-xl text-sm leading-6 text-border">
            The demo is intended for validation, testing, and product feedback.
            It is not a production payment product.
          </p>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={pitchHref} className={secondaryButtonClass}>
            <Play aria-hidden size={16} />
            {pitchLabel}
          </a>
          <a href={demoHref} className={secondaryButtonClass}>
            <Play aria-hidden size={16} />
            {demoLabel}
          </a>
          <a href={apkHref} className={secondaryButtonClass}>
            <Smartphone aria-hidden size={16} />
            {apkLabel}
          </a>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5">
        <p className="text-sm font-semibold text-text">Sandbox test details</p>
        <div className="mt-4 space-y-3">
          <SandboxRow icon={WalletCards} label="On-ramp" value="Test flow" />
          <SandboxRow icon={QrCode} label="Checkout" value="QR/NFC capture" />
          <SandboxRow icon={ReceiptText} label="Record" value="Structured event" />
          <SandboxRow icon={ShieldCheck} label="Status" value="Demo environment" />
        </div>
      </div>
    </div>
  );
}

function SandboxRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof WalletCards;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-bg px-4 py-3">
      <span className="flex items-center gap-3 text-sm font-medium text-text">
        <Icon aria-hidden className="text-accent" size={18} />
        {label}
      </span>
      <span className="text-sm text-muted">{value}</span>
    </div>
  );
}

export function MarketMapVisual() {
  const cities = [
    ["Berlin", "cafes, kiosks, small groceries"],
    ["Munich", "bakeries, bars, takeaway shops"],
  ] as const;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {cities.map(([city, body]) => (
          <div key={city} className="rounded-lg bg-accent-soft p-5">
            <MapPin aria-hidden className="text-accent" size={24} />
            <p className="mt-4 text-lg font-semibold text-text">{city}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {["Low-ticket baskets", "QR/NFC capture", "Merchant dashboard"].map(
          (item) => (
            <div
              key={item}
              className="rounded-lg border border-border bg-bg px-4 py-3 text-sm font-medium text-muted"
            >
              {item}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function VerificationVisual() {
  const rows = [
    ["Event ID", "EVT-42819"],
    ["Timestamp", "2026-06-02 14:18"],
    ["Merchant hash", "0x4f2...91a"],
    ["Integrity status", "Verified"],
  ] as const;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-text">Behind the scenes</p>
          <p className="mt-1 text-xs text-muted">Traceable activity metadata</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-success-soft text-success">
          <Fingerprint aria-hidden size={22} />
        </span>
      </div>
      <dl className="mt-5 space-y-3">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-b-0 last:pb-0"
          >
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="font-mono text-sm font-semibold text-text">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex items-center gap-3 rounded-lg bg-success-soft p-3 text-sm font-semibold text-success">
        <CheckCircle2 aria-hidden size={18} />
        Simple on the front end. Verifiable behind the scenes.
      </div>
    </div>
  );
}

export function PartnerPipelineVisual() {
  const nodes = [
    { icon: Store, label: "Merchant" },
    { icon: Database, label: "MCBuse data layer" },
    { icon: Building2, label: "Partners" },
    { icon: Banknote, label: "Financial access" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {nodes.map((node) => (
        <div
          key={node.label}
          className="rounded-lg border border-border bg-surface p-4 text-center"
        >
          <node.icon aria-hidden className="mx-auto text-accent" size={26} />
          <p className="mt-3 text-sm font-semibold text-text">{node.label}</p>
        </div>
      ))}
    </div>
  );
}

export function LinkIcon() {
  return <Link2 aria-hidden size={16} />;
}
