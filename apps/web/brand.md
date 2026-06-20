# MCBuse Brand - Web

Source of truth for the MCBuse public web surface. Direction: **modern European fintech infrastructure with a subtle blockchain/data layer**. The product should feel credible to banks, fintechs, ecosystem reviewers, investors, and pilot merchants without looking like a generic crypto site.

## Voice

- Clear, professional, and partner-friendly.
- Simple enough for merchants, strong enough for financial partners.
- Use stage-safe language: "we are building," "sandbox demo," "MVP development," "pilot preparation," and "partner-enabled infrastructure."
- Never overclaim. MCBuse is **not a bank** and **not a licensed payment institution**. Regulated processing is handled by licensed partners.
- Keep blockchain behind the scenes. Lead with financial visibility, payment data, merchant records, and partner infrastructure.

## Color Tokens

All consumed as Tailwind utilities via `@theme` in `app/globals.css`. Use semantic token names, not inline hex values.

| Token | Hex | Tailwind class | Use |
|---|---|---|---|
| `--color-bg` | `#F7FBFF` | `bg-bg` | Page background |
| `--color-surface` | `#FFFFFF` | `bg-surface` | Cards, panels, mockups |
| `--color-text` | `#071A33` | `text-text` | Primary text |
| `--color-muted` | `#50647A` | `text-muted` | Body copy, secondary labels |
| `--color-subtle` | `#7890A8` | `text-subtle` | Metadata, helper text |
| `--color-border` | `#D7E6F5` | `border-border` | Default hairlines |
| `--color-border-strong` | `#AFC8E5` | `border-border-strong` | Emphasized dividers |
| `--color-accent` | `#0B84F3` | `bg-accent` / `text-accent` | Primary CTA and key data |
| `--color-accent-hover` | `#076CC8` | `hover:bg-accent-hover` | Primary CTA hover |
| `--color-accent-soft` | `#EAF5FF` | `bg-accent-soft` | Light blue bands, badges |
| `--color-navy` | `#071A33` | `bg-navy` / `text-navy` | Deep trust blocks |
| `--color-navy-soft` | `#10284A` | `bg-navy-soft` | Secondary navy surfaces |
| `--color-success` | `#16885D` | `text-success` | Verified, matched, ready states |
| `--color-success-soft` | `#E7F6EE` | `bg-success-soft` | Success chips |
| `--color-warning` | `#B76B00` | `text-warning` | Sandbox, review, pending states |
| `--color-warning-soft` | `#FFF3D8` | `bg-warning-soft` | Warning chips |

## Type

- Geist Sans for UI. Geist Mono for amounts, identifiers, and activity records.
- Headlines should be confident and readable. Do not use negative letter spacing.
- Body copy uses 16px base sizing, with `text-muted` for secondary lines.

## Layout

- One-page MVP with stable anchor sections.
- Max content width around `max-w-6xl`.
- Full-width bands are allowed; do not turn whole page sections into floating cards.
- Use individual cards for repeated items, mock dashboard panels, team members, and CTAs.
- Cards use 8px radius or less.

## Visual Rules

- Use blue, white, soft gray, navy, green, and orange with restraint.
- Use product mockups, transaction records, QR/NFC flows, data pipelines, and dashboard previews.
- Avoid stock banking imagery, crypto coin motifs, dark-only Web3 styling, decorative blobs, and unsupported third-party logos.

## Disclaimer Line

> MCBuse is not a bank or licensed payment institution. Regulated payment processing is handled by licensed partners.

This must appear in the footer of every public page.
