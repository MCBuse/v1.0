# MCBuse Brand — Web

Source of truth for the MCBuse public web surface. Direction: **modern European fintech data infrastructure, dark-first**. The product should feel credible to banks, fintechs, ecosystem reviewers, investors and pilot merchants without looking like a generic crypto site.

**Aesthetic direction: stark minimal.** Near-black canvas, a single blue accent, generous whitespace, tight technical typography. Closer to Vercel or Linear than to a consumer app.

> **This file covers brand only** — palette, voice, type, visual rules. For routes, copy, component contracts, interaction states, accessibility and SEO, see `../../docs/website-plan/mcbuse-website-handover.md`. For the visual spec and per-screen design prompts, see `../../docs/website-plan/mcbuse-stitch-prompts.md`. Where this file and the handover disagree, the handover wins.

## Voice

- Clear, professional, and partner-friendly.
- Simple enough for merchants, strong enough for financial partners.
- Use stage-safe language: "we are building," "sandbox demo," "MVP development," "pilot preparation," and "partner-enabled infrastructure."
- Never overclaim. MCBuse is **not a bank** and **not a licensed payment institution**. Regulated processing is handled by licensed partners.
- Keep blockchain behind the scenes in *imagery*, but name stablecoins factually in *copy* where it matters. Lead with financial visibility, payment data, merchant records and partner infrastructure.

**There is a locked lexicon with banned terms** — "micro-banking", "credit score", "automated underwriting", "approved", "guaranteed" and others. See handover §2 before writing any copy. The banned terms remain correct inside an explicit negation ("does not produce a credit score") or when describing a partner's accountability; see handover §2.1.

## Color Tokens

All consumed as Tailwind utilities via `@theme` in `app/globals.css`. Use semantic token names, **never inline hex values**.

Neutrals are lifted from the mobile app's dark theme (`../mobile/theme/dark-theme.ts`) so web and app read as one family. The brand blue is re-tuned for dark backgrounds.

| Token | Hex | Tailwind class | Use |
|---|---|---|---|
| `--color-bg` | `#0A0B0D` | `bg-bg` | Page background |
| `--color-surface` | `#14161A` | `bg-surface` | Cards, panels, mockups |
| `--color-surface-2` | `#1C1C1E` | `bg-surface-2` | Raised panels *(app value)* |
| `--color-ink` | `#000000` | `bg-ink` | Signature full-bleed bands *(app value)* |
| `--color-text` | `#FFFFFF` | `text-text` | Headings, primary text |
| `--color-muted` | `#8E8E93` | `text-muted` | Body copy, secondary labels *(app value)* |
| `--color-subtle` | `#636366` | `text-subtle` | **Metadata and icons only — never body text** *(app value)* |
| `--color-border` | `rgba(255,255,255,0.08)` | `border-border` | Default hairlines |
| `--color-border-strong` | `rgba(255,255,255,0.16)` | `border-border-strong` | Emphasized dividers, input borders |
| `--color-action` | `#FFFFFF` | `bg-action` | **Primary button fill** |
| `--color-action-hover` | `#EBEBEB` | `hover:bg-action-hover` | Primary button hover *(app brandDark)* |
| `--color-on-action` | `#000000` | `text-on-action` | Text on the primary button |
| `--color-accent` | `#2E96FF` | `text-accent` | Links, icons, active state, data |
| `--color-accent-hover` | `#57ACFF` | `hover:text-accent-hover` | Link hover |
| `--color-accent-strong` | `#0B84F3` | — | Brand mark only *(original brand blue)* |
| `--color-accent-soft` | `rgba(46,150,255,0.12)` | `bg-accent-soft` | Tint bands, chips |
| `--color-on-accent` | `#06070A` | `text-on-accent` | Text on accent-filled chips |
| `--color-success` | `#22C55E` | `text-success` | Verified, ready states |
| `--color-success-soft` | `rgba(34,197,94,0.12)` | `bg-success-soft` | Success chips |
| `--color-warning` | `#FF9500` | `text-warning` | Sandbox, review, pending *(app value)* |
| `--color-warning-soft` | `rgba(255,149,0,0.12)` | `bg-warning-soft` | Warning chips |
| `--color-error` | `#FF3B30` | `text-error` | Failed, missing, invalid *(app value)* |
| `--color-error-soft` | `rgba(255,59,48,0.12)` | `bg-error-soft` | Error chips |

**White means act. Blue means navigate or inform.** Primary buttons are white; blue is reserved for links, active nav, icons, focus rings and data highlights, and never fills a button. Blue always carries meaning — never decorative. Green, amber and red appear only as status, always paired with a word and an icon so colour is never the sole signal.

### Two rules that are easy to get wrong

- **Primary buttons are `text-on-action` on `bg-action` — black on white, never white on blue.** White on `#0B84F3` measures 3.74:1, below WCAG AA; white on `#2E96FF` is worse still. Black on white is 19.7:1, and it matches the mobile app's own `btnPrimary`/`btnPrimaryText` (`apps/mobile/theme/dark-theme.ts`).
- **`text-subtle` never carries body text.** It measures 3.29:1 on `bg` — fine for a mono numeral, a metadata line or an icon; it fails AA for anything a reader needs. Body copy is always `text-muted` (6.04:1).

## Type

- **IBM Plex Sans** for UI, via `next/font/google`, weights 400/500/600/700.
- **IBM Plex Mono** for every number, currency amount, percentage, timestamp, ID, field name and code label. This is the strongest brand signal on the site.
- Matches the mobile app, which runs IBM Plex Sans via `@expo-google-fonts/ibm-plex-sans`.
- Display 56 / H1 40 / H2 30 / H3 20 / Body 16 / Small 14 / Label 12 uppercase.
- **Negative letter spacing on display sizes** — Display `-0.03em`, H1 and H2 `-0.02em`. The mobile app's own scale does the same (`display: -1`, `h1: -0.3`), and tight display tracking is what keeps a dark minimal page from reading as a template.
- Body copy uses 16px base with 1.6 line-height, in `text-muted`.
- Four weights total. 700 is display and H1 only.
- Add `font-variant-numeric: tabular-nums` wherever mono figures stack in a column.

## Layout

- Multi-route site: `/` plus `/product`, `/merchants`, `/partners`, `/roadmap`, `/demo`, `/contact`, `/company`, and legal stubs.
- Max content width `max-w-6xl` (1152px).
- Section rhythm is large — `py-24` on mobile, `lg:py-32` on desktop.
- Full-width bands are encouraged; do not turn whole page sections into floating cards.
- Use individual cards for genuinely repeated items — mock dashboard panels, team members, product modules, CTAs.
- **Break symmetry.** Prefer unequal splits (7/5, 8/4) over centred 50/50 and over three identical columns. Centred layouts are reserved for CTA strips and `/contact`.

## Radius — sharp throughout

Everything is square. Buttons, cards, chips, inputs, panels: `0`.

This is the single biggest departure from the mobile app, which uses pills and 16px cards. A marketing site is allowed to diverge from product UI, and the sharp corners are what make the site read as engineered infrastructure rather than another rounded SaaS page. The one exception is a decorative status dot, which stays circular.

Do not reintroduce rounding. The radius tokens in `app/globals.css` are all set to `0px` so `rounded-card`, `rounded-panel` and friends stay square even if used.

## Buttons

Uppercase, mono, wide tracking, 48px tall, square. The mono treatment separates actions from links at a glance and reinforces mono-as-brand.

| Variant | Style |
|---|---|
| Primary | `bg-action` fill, `text-on-action`, `border-action` |
| Secondary | transparent, `border-border-strong`, `text-text`; hover brightens the border |
| Tertiary | `text-accent` link with a trailing chevron, no fill, no border |

One primary per section. The class constants live in `components/site/primitives.tsx` — use them rather than restyling.

## Elevation

Elevation comes from **background shade**, not shadow: `ink` < `bg` < `surface` < `surface-2`.

Exactly one shadow is permitted site-wide — the hero product panel on `/`, at `0 4px 16px rgba(0,0,0,0.18)` (the app's balance-card value). Nothing else gets a shadow. No `backdrop-filter` except the sticky header's blur.

**No gradient fills.** The mobile app has zero, and the site follows — no gradient on any surface, text or button.

Two exceptions, both texture rather than fill, defined as `.grid-backdrop` / `.grid-backdrop-bottom` / `.hero-glow` in `app/globals.css`:

- **The masked grid backdrop.** A 48px grid of white hairlines at 3.5%, radial-masked so it fades out before it reaches the content. It gives a flat dark page depth and a technical texture without adding colour. Used behind the hero and inside the demo video poster.
- **One hero radial**, accent at ≤6%, for depth only. No violet, no second hue.

## Motion

- Entrances 300ms, exits 200ms. Entry is deliberately longer than exit.
- Easing `cubic-bezier(0.16, 1, 0.3, 1)`.
- No bounce, no spring overshoot, no parallax, no scroll-triggered reveal chains, no scroll-jacking, no autoplaying video.
- **Never `transition: all` or `transition-all`** — always name the properties.
- Everything sits behind a `prefers-reduced-motion: reduce` block.

## Visual Rules

**Use** product mockups, transaction records with mono amounts and timestamps, QR/NFC flows, status chips, data-field tables, dashboard previews, and simple flow diagrams built from bordered boxes and thin arrows.

**Never use:**

- coins, tokens, chains, blockchain cubes, wallets, hexagon grids, node networks
- any gradient, especially violet-to-blue; no gradient text
- glassmorphism, frosted panels, glowing orbs, decorative blobs, particle fields
- stock photography of cafés, shopkeepers, handshakes, bank interiors or skylines
- a row of three identical cards each with a circular icon, a heading and a paragraph
- uniform border-radius and identical padding on every element
- emoji, or vague headlines like "Build the future"
- third-party logos of any kind until written permission is confirmed

The anti-crypto guardrail and the anti-generic guardrail are the same guardrail: **show the data product, not a metaphor for it.**

## Brand Mark

**There is no MCBuse logo yet** — nothing in this repo, in `apps/mobile/assets/`, or in `public/`. Interim lockup: a 32px rounded-square monogram tile in `bg-accent` with an `#06070A` letter "M", followed by "MCBuse" in IBM Plex Sans 600. This is the top blocking asset.

## Icons

`lucide-react` first (already a dependency). For payment, NFC, scan, analytics and security glyphs lucide lacks, use the 553 single-colour 24×24 SVGs in `/Users/fred/Documents/Projects/mcbuse/icons/` — root `fill="none"` with filled paths, so recolour via `fill="currentColor"`. `@svgr/webpack` is already configured.

## Disclaimer Line

> MCBuse is a merchant-facing software and data layer. Regulated payment execution, settlement, safeguarding, KYC/KYB, AML checks, lending decisions and underwriting remain with licensed partners where required.

> MCBuse is not a bank or a licensed payment institution.

Both lines must appear in the footer of every public page. Three routes override the first line with a route-specific boundary statement — see handover §2.
