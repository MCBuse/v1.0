# MCBuse Brand — Web

Source of truth for the MCBuse web surface. Direction: **warm monochrome + operational**. The product is small-merchant tooling; the visual should feel quiet, trustworthy, and ledger-like — not flashy fintech.

## Voice

- Short sentences. Plain words. Concrete nouns (payouts, exceptions, payments) over abstract ones (solutions, ecosystems).
- Merchant-friendly. Avoid fintech jargon (PSP, acquirer, ledger, settlement) in public copy. Internal docs can use them.
- Never overclaim. We are **not a bank** and **not a licensed payment institution**. Regulated processing is handled by licensed partners.
- Active voice. The merchant is the subject.

## Color tokens

All consumed as Tailwind utilities via `@theme` in `app/globals.css`. Use the semantic name, not the hex.

| Token | Hex | Tailwind class | Use |
|---|---|---|---|
| `--color-bg` | `#FAF7F2` | `bg-bg` | Page background, cream |
| `--color-surface` | `#FFFFFF` | `bg-surface` | Cards, dashboard mocks |
| `--color-text` | `#1A1714` | `text-text` | Primary text |
| `--color-muted` | `#6B635A` | `text-muted` | Secondary text, captions |
| `--color-subtle` | `#918879` | `text-subtle` | Metadata, micro-labels |
| `--color-border` | `#E8E2D8` | `border-border` | Hairlines, default card borders |
| `--color-border-strong` | `#D6CDBD` | `border-border-strong` | Emphasized dividers |
| `--color-accent` | `#C9551A` | `bg-accent` / `text-accent` | Primary CTA, key data points (terracotta) |
| `--color-accent-hover` | `#B14913` | `hover:bg-accent-hover` | CTA hover |
| `--color-accent-soft` | `#FBEFE6` | `bg-accent-soft` | Accent backgrounds (badges, chips) |
| `--color-success` | `#5C7A3A` | `text-success` | Paid / matched states (olive) |
| `--color-success-soft` | `#ECF1E2` | `bg-success-soft` | Success chips |
| `--color-warning` | `#C28A1F` | `text-warning` | Exception flags (amber) |
| `--color-warning-soft` | `#FBF1DA` | `bg-warning-soft` | Warning chips |

**Accent discipline.** Terracotta is used sparingly — primary CTAs and one or two key data points per view. Don't tint icons, dividers, or links unless they are the call-to-action.

## Type

- Geist Sans for UI. Geist Mono for numbers in dashboard mocks (amounts, IDs, counts).
- Headlines: tight tracking (`tracking-tight`, applied in base layer).
- Body: 16px base; `text-muted` for secondary lines.

## Layout

- Max content width `~1180px` for marketing sections. Hero can breathe slightly wider.
- Generous vertical rhythm — sections breathe at 80–120px on desktop, 56–72px on mobile.
- Cards: 14px radius, hairline border + soft shadow (see `--shadow-card`).

## Don'ts

- No gradients in v1. Flat surfaces only.
- No emoji in product copy or marketing copy.
- No stock photography. Use built-in-code dashboard mocks.
- No dark mode in v1 — warm monochrome is light-first.

## Disclaimer line (verbatim)

> MCBuse is not a bank or licensed payment institution. Regulated payment processing is handled by licensed partners.

Must appear in the footer of every public page.
