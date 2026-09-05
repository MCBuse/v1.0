import { ArrowDown, Nfc } from "lucide-react";

import { BOUNDARY } from "../site/content";
import { StatusChip } from "../site/primitives";

/**
 * A QR-shaped matrix, not a real QR code — this is a product mockup and a
 * scannable code pointing nowhere would be worse than an honest graphic.
 * Deterministic (fixed-seed LCG) so server and client markup match.
 */
const QR_SIZE = 21;

function qrModules(): boolean[][] {
  let seed = 0x4d43_4275; // "MCBu"
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const isFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= QR_SIZE - 7) || (r >= QR_SIZE - 7 && c < 7);

  const finderOn = (r: number, c: number) => {
    const rr = r >= QR_SIZE - 7 ? r - (QR_SIZE - 7) : r;
    const cc = c >= QR_SIZE - 7 ? c - (QR_SIZE - 7) : c;
    const edge = rr === 0 || rr === 6 || cc === 0 || cc === 6;
    const core = rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4;
    return edge || core;
  };

  return Array.from({ length: QR_SIZE }, (_, r) =>
    Array.from({ length: QR_SIZE }, (_, c) => {
      if (isFinder(r, c)) return finderOn(r, c);
      if (r === 7 || c === 7) return (r + c) % 2 === 0;
      return next() > 0.5;
    }),
  );
}

function QrMatrix() {
  const modules = qrModules();

  return (
    <svg
      viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`}
      role="img"
      aria-label="Payment QR code"
      className="h-full w-full"
      shapeRendering="crispEdges"
    >
      <rect width={QR_SIZE} height={QR_SIZE} fill="#ffffff" />
      {modules.map((row, r) =>
        row.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#000000" /> : null,
        ),
      )}
    </svg>
  );
}

function RecordRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-subtle">{label}</span>
      <span
        className={`text-sm text-text ${mono ? "tabular font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

export function HeroPanel() {
  return (
    <figure className="m-0 w-full max-w-md">
      <div className="border border-border bg-surface">
        {/* ── Zone 1: the payment moment ───────────────────────── */}
        <div className="p-6">
          <div className="mb-6 flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
              Payment request
            </span>
            <StatusChip tone="accent">EURC</StatusChip>
          </div>

          <p className="tabular font-mono text-4xl font-medium leading-none tracking-[-0.02em] text-text">
            3.40
          </p>
          <p className="mt-2 text-sm text-muted">Kiosk checkout · Berlin</p>

          <div className="mt-6 flex items-end gap-4">
            <div className="h-28 w-28 shrink-0 border border-border-strong bg-white p-1.5">
              <QrMatrix />
            </div>
            <div className="flex min-h-28 flex-col justify-end gap-2 pb-1">
              <Nfc aria-hidden size={20} className="text-accent" />
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                NFC ready
              </span>
            </div>
          </div>
        </div>

        {/* ── The transform ─────────────────────────────────────── */}
        <div className="relative border-t border-border">
          <span
            aria-hidden
            className="absolute -top-3.5 left-6 inline-flex h-7 w-7 items-center justify-center border border-border-strong bg-bg text-accent"
          >
            <ArrowDown size={14} />
          </span>
        </div>

        {/* ── Zone 2: the structured record ─────────────────────── */}
        <div className="bg-bg p-6 pt-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
              Structured record
            </span>
            <StatusChip tone="success" dot>
              Captured
            </StatusChip>
          </div>

          <div>
            <RecordRow label="Amount" value="3.40 EURC" />
            <RecordRow label="Captured" value="14:22:07 CET" />
            <RecordRow label="Method" value="NFC" />
            <RecordRow label="Merchant" value="MRC-4821" />
            <RecordRow label="Ticket size" value="Low-ticket" mono={false} />
          </div>
        </div>
      </div>

      <figcaption className="mt-3 font-mono text-[11px] text-subtle">{BOUNDARY.b9}</figcaption>
    </figure>
  );
}
