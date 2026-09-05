# MCBuse Website — Implementation Handover

**Version 1.0 · 2026-09-04 · Dark theme · Target: `apps/web`**

This document is the engineering contract for the MCBuse public website. It assumes you have **not** read the PDFs in this folder — you don't need to.

**Its companion is `mcbuse-stitch-prompts.md`, in this same folder.** That file holds the visual spec and the per-section body copy. This file holds everything else: lexicon, tokens as code, routes, component contracts, interaction states, forms, accessibility, SEO, and acceptance criteria. Read both. Where they overlap, the token values here are authoritative.

---

## 1. What this supersedes

| File | Status |
|---|---|
| `docs/website-plan/*.pdf` (8 files) | **Superseded.** Content preserved here and in the Stitch file; structure changed — see §1.1. |
| `apps/web/web.md` (883 lines) | **Superseded for structure and visual style.** Still useful as a content archive; §11 (technical recommendations) and §11's analytics list remain valid. |
| `apps/web/brand.md` | **Superseded.** It specifies a light palette (`#F7FBFF`), Geist, ≤8px radius, "do not use negative letter spacing", and "avoid dark-only Web3 styling". All four are now reversed. Leave the file in place but treat this document as the source of truth. |
| `apps/web/app/globals.css` `@theme` block | **To be replaced** with §5 below. |
| `docs/colosseum-hackathon-non-technical-brief.md` §8 | **Still authoritative** for vocabulary. §2 below is derived from it. |

### 1.1 Structural changes from the PDFs, and why

| Change | Reason |
|---|---|
| Nav cut from 7 items + 2 buttons to 5 items + 1 button | Seven top-level items with two competing header CTAs gives no hierarchy. `Watch Demo` moves into the hero and `/demo`. |
| Tab 6 split into `/demo` and `/contact` | One page held three parallel forms, a sandbox, two videos and an APK download. `/demo` was already the link destination from Tabs 2 and 3. |
| Three side-by-side forms → one form with a segment selector | Three parallel forms raise abandonment and collapse badly on mobile. The three original anchors still work as deep links (§7.2). |
| New: audience-split module on `/` | The site serves micro-merchants and banks — opposite readers — and never asked which you were. |
| Homepage problem cards cut 5 → 3 | Original cards 2, 4 and 5 were one idea in three forms. A uniform five-card icon grid is also the most recognisable AI-generated layout. |
| New: FAQ on `/merchants` and `/partners` | The compliance boundaries were footer-only. They answer the questions both audiences actually arrive with, so they belong above the fold-line, not in the footer. |
| New: data-governance band on `/partners` | For a bank or PSP reader this is the deciding content, and it was absent. |
| New: vision band on `/roadmap` | Phase 4 said only "Future Vision". The approved vision line now appears verbatim. |
| Roadmap phases labelled `Now / Next / Later` | Original phases had no time anchoring and no indication of current position. |
| Eligibility check fully specified | Original spec was one line: "drops down inline check results". It's the highest-intent element on `/merchants`. See §7.3. |
| APK moved to request-only | A public prototype APK download is a trust problem for a bank audience, and it's Android-only. |
| Business model, market entry, "why verifiable records" imported from `web.md` | Present in `web.md`, absent from the PDFs. Folded into `/roadmap`, `/merchants` and `/product` respectively. |
| Ecosystem / partner logo wall **not built** | `web.md:451` flags that permission is unconfirmed for Colosseum, Solana, Superteam, Stripe and university logos. Omitted until confirmed. |
| `/privacy`, `/terms`, `/impressum` get real routes | They existed only as footer links with no page behind them. |

| Dropped: Tab 1's "Invisible Cash Cycle vs. Structured Infrastructure" comparison diagram | An abstract before/after metaphor, which conflicts with the "show the data product, not a metaphor for it" rule. Its intent — the contrast between unprovable and provable — is carried instead by the two pull-quotes on `/` ("I run a real business, but I cannot prove it clearly." → "Here is the trusted financial record…"), which say the same thing in the merchant's own words. |
| Dropped: Tab 4's "Corporate Data Graphic — B2B fintech data pipelines and bank core connectors" | A decorative pipeline illustration tells a bank nothing. Replaced by the actual Level 1–2 field table (§7.4), which is the thing a partner reader wants to see. |
| Dropped: Tab 3's "Urban micro-retailer storefront in Berlin or Munich" photo | No such photography exists, and stock imagery of a café is a strong generic-template signal. See §13. |

**Nothing else was dropped.** Every headline, CTA, form field, benefit line and boundary statement from the 8 PDFs appears in this document or in the Stitch file.

---

## 2. Locked lexicon

Derived from `docs/colosseum-hackathon-non-technical-brief.md` §8. **Grep the finished site against the banned list before shipping.**

### Use

merchant data · financial intelligence · a trusted data layer · under-documented micro-merchants · verified sales history · structured financial data · merchant activity records · financial analytics · credit readiness · credit-readiness indicators · readiness gaps · lender-ready merchant profile · merchant consent and control · independently verifiable · merchant-authorized sharing · stablecoin payments as the capture surface · preparation for responsible credit assessment · licensed partners · pilot preparation · sandbox demo · MVP

### Never use

| Banned | Because |
|---|---|
| micro-banking, banking for the unbanked | Implies a regulated deposit-taking product MCBuse is not |
| credit scoring, credit score, risk score | MCBuse produces *readiness indicators*, not scores |
| automated underwriting, AI credit scoring | Underwriting is the partner's, and no model makes decisions here |
| lending platform, loans, BNPL | MCBuse does not lend |
| generic payment gateway, another crypto wallet | Wrong category; places MCBuse in a crowded field |
| approved, guaranteed, instant approval | MCBuse approves nobody |
| fully compliant, live production payment network | Untrue at MVP stage |
| Solana application, sharing-economy infrastructure | Wrong category |

### 2.1 How the ban list works

The banned terms are banned **as claims**. They remain correct — and required — in two shapes:

1. **Inside an explicit negation.** "MCBuse does not provide loans and does not produce a credit score."
   "Matching means preparation, not a guaranteed connection." These are the boundary statements in §2's
   B-list, and they are the most important copy on the site. Do not strip them to satisfy a keyword grep.
2. **Describing a partner's accountability.** "Financial products, approvals, underwriting and regulated
   services remain with licensed partners." "…through which approved stablecoin issuers can reach
   merchants" (the approved vision line, verbatim).

What is never permitted is the term as something MCBuse asserts about a merchant, a product it offers,
or an outcome it produces. When in doubt: if removing the word would make the sentence a stronger claim,
the word is doing boundary work and stays.

### Say this, not that

| Never say | Say instead |
|---|---|
| "MCBuse decides whether a merchant is creditworthy." | "MCBuse helps the merchant build evidence of business performance." |
| "MCBuse guarantees access to a loan." | "The merchant can share a verifiable profile with an authorized lender." |
| "This merchant has been approved." | "MCBuse shows whether the available history is ready for assessment." |
| "The profile predicts that the merchant will repay." | "The lender remains responsible for the credit decision." |

### Canonical names — use these exact strings

The four modules: **Payment Capture** · **Business Analytics** · **Credit-Readiness** · **Institutional Matching**.
The audience: **micro-merchants** (not "Micro-SME", not "micro-retailers", not "SMBs").
The company one-liner: **"MCBuse turns everyday low-ticket merchant payments into structured financial records — analytics merchants can use, and evidence institutions can verify."**

### Boundary statements — verbatim, and where each must appear

```
B1 (global footer, every page):
MCBuse is a merchant-facing software and data layer. Regulated payment execution,
settlement, safeguarding, KYC/KYB, AML checks, lending decisions and underwriting remain
with licensed partners where required.

B2 (global footer, every page, second line):
MCBuse is not a bank or a licensed payment institution.

B3 (/merchants footer, replaces B1):
MCBuse does not provide loans and does not make final credit decisions. The MVP generates
early credit-readiness indicators to help merchants become more understandable to financial
institutions in the future.

B4 (/partners footer, replaces B1):
MCBuse does not replace regulated financial infrastructure. Financial products, approvals,
underwriting and regulated services remain with licensed partners.

B5 (/roadmap footer, replaces B1):
The roadmap reflects current MVP scope and future product direction. Timelines are
indicative and subject to change based on pilot results and partner discussions.

B6 (/demo, inline disclaimer panel):
The sandbox demo is for testing, validation and product demonstration. It is not a full
production payment or lending product, and some features are simulated.

B7 (hero safety line, / only):
Currently in MVP and pilot preparation. Regulated payment and financial services are
handled by licensed partners.

B8 (module 03 on /product, and anywhere readiness is mentioned):
MCBuse does not provide loans and does not produce a credit score. MVP outputs are
readiness indicators only.

B9 (beside any dashboard mockup):
Sample data. Not a live merchant account.
```

---

## 3. Stack and placement

Build **into the existing app** at `apps/web`. Do not scaffold a new project.

| | |
|---|---|
| Framework | Next.js 16.2.0, App Router, `next dev --webpack` |
| React | 19.2 |
| Styling | Tailwind CSS v4 — tokens declared in `@theme` in `app/globals.css`, consumed as utilities. No `tailwind.config.js`. |
| Icons | `lucide-react` (already a dependency). For payment/NFC/analytics glyphs lucide lacks, use the 553 single-colour 24×24 SVGs in `/Users/fred/Documents/Projects/mcbuse/icons/` — root `fill="none"` with filled paths, so recolour via `fill="currentColor"`. `@svgr/webpack` is already configured. |
| Fonts | **Change from Geist to IBM Plex.** Use `next/font/google`: `IBM_Plex_Sans` weights 400/500/600/700 and `IBM_Plex_Mono` weights 400/500. Delete the `localFont` Geist declarations in `app/layout.tsx` and the two `.woff` files in `app/fonts/`. Rationale: the mobile app already runs IBM Plex Sans via `@expo-google-fonts/ibm-plex-sans`, so web and app become one family. |
| Monorepo | pnpm workspaces + Turborepo. `pnpm dev --filter web`, port 3000. |
| Animation | `web.md` suggests Framer Motion. Not required — every motion in §8 is achievable with CSS transitions. Add it only if you need the accordion height spring. |

### 3.1 Reuse what's already there

`apps/web/components/landing/` holds 14 components from the previous light-theme one-pager. **Restructure them into routes; do not rewrite from scratch.** These exports are already correct and survive the theme change unchanged because they reference semantic tokens, not hex values:

- `components/landing/Section.tsx` — the `Section` wrapper with its `tone` prop (`default` / `surface` / `soft` / `navy`), `eyebrow`, `title`, `intro`, `centered`. Keep it; rename the `navy` tone to `ink` and repoint it at `--color-ink`. It already applies `max-w-6xl` and `px-5 py-16 sm:px-8 lg:py-24` — bump the vertical padding to `py-24 lg:py-32` for the new 96/128px rhythm.
- `primaryButtonClass`, `secondaryButtonClass`, `linkFocusClass` — exported class constants in the same file. Update the values per §6.2; every consumer keeps working.
- `min-h-11` on every interactive element — already correct for the 44px touch-target rule.
- `components/landing/constants.ts` — `CONTACT_EMAIL`, `EXTERNAL_LINKS`, `TEAM_MEMBERS`, and the helpers `mailto()`, `linkOrRequestAccess()`, `hasConfiguredUrl()`, `outboundProps()`. Reuse as-is. See §9.

Component → route mapping:

| Existing component | Destination |
|---|---|
| `Nav.tsx` | `app/layout.tsx` — becomes the site header; nav items change per §4 |
| `Footer.tsx` | `app/layout.tsx` — add the Legal column and the per-route boundary override |
| `Hero.tsx` | `app/page.tsx` |
| `Problem.tsx` | `app/page.tsx` — rebuilt as 3 asymmetric rows |
| `Solution.tsx`, `HowItWorks.tsx` | `app/page.tsx` (flow) and `app/product/page.tsx` (7 steps) |
| `Benefits.tsx` | `app/page.tsx` (value snapshot) and `app/merchants/page.tsx` (checklist) |
| `DashboardMock.tsx` | `app/merchants/page.tsx` — keep and restyle dark |
| `Demo.tsx` | `app/demo/page.tsx` |
| `Business.tsx` | `app/roadmap/page.tsx` |
| `TeamRoadmap.tsx` | split → `app/company/page.tsx` and `app/roadmap/page.tsx` |
| `PilotFocus.tsx` | `app/merchants/page.tsx` (market entry band) |
| `FinalCta.tsx` | shared CTA-strip component, used on every route |
| `Section.tsx` | shared, as above |

New components needed: `AudienceSplit`, `Accordion`, `SegmentedControl`, `EligibilityCheck`, `Timeline`, `DataFieldTable`, `FlowDiagram`, `StatusChip`, `VideoCard`, `ContactForm`.

---

## 4. Routes

| Path | Purpose | Primary CTA | Anchors | Footer boundary |
|---|---|---|---|---|
| `/` | Positioning, audience fork, problem, solution, value, boundary | Join the Pilot | `#top` | B1 + B2 |
| `/product` | The four modules, why verifiable records, 7-step flow | Request sandbox access | `#payment-capture` `#business-analytics` `#credit-readiness` `#institutional-matching` `#how-it-works` | B1 + B2 |
| `/merchants` | Merchant value prop, benefits, eligibility check, market entry, FAQ | Join the Pilot | `#eligibility` `#faq` | B3 + B2 |
| `/partners` | B2B value prop, accountability split, data fields, governance, FAQ | Schedule a partner call | `#data-fields` `#governance` `#faq` | B4 + B2 |
| `/roadmap` | Four phases, business model, vision | Join the waitlist | `#phases` `#business-model` `#vision` | B5 + B2 |
| `/demo` | Sandbox explainer, video, access request, prototype build | Request access | `#sandbox` `#access` | B1 + B2 |
| `/contact` | Routed intake form | per segment | `#merchant-form` `#partner-form` `#waitlist-form` | B1 + B2 |
| `/company` | Mission, team, how we communicate | Join the Pilot | `#team` | B1 + B2 |
| `/privacy` | Privacy policy | — | — | B1 + B2 |
| `/terms` | Terms of use | — | — | B1 + B2 |
| `/impressum` | German legal notice — see §12 | — | — | B1 + B2 |

**Body copy for each route lives in the companion file**, `mcbuse-stitch-prompts.md`:
`/` → §2 · `/product` → §3 · `/merchants` → §4 · `/partners` → §5 · `/roadmap` → §6 ·
`/demo` → §7 · `/contact` → §8 · `/company` → §9. Component appearance is §10, mobile
collapse rules are §11. This document carries the copy that file does not: boundary
statements (§2), validation messages (§7.2), eligibility outcomes (§7.3), the data-field
table (§7.4), alt text (§10.3) and page metadata (§11).

**Redirects for the old one-page links.** A hash fragment never reaches the server, so these split in two:

- **Path aliases** — `redirects()` in `next.config.js`: `/product-systems`, `/for-merchants`, `/for-partners`, `/about`, `/team`, `/sandbox`.
- **Hash fragments** — `components/site/HashRedirect.tsx`, mounted on `/`, maps `#product`, `#merchants`, `#partners`, `#roadmap`, `#about`, `#team`, `#contact`, `#demo`, `#sandbox`, `#market`, `#blockchain` to their routes client-side.

Header nav: `Product · Merchants · Partners · Roadmap · Company` + primary button `Join the Pilot` → `/contact#merchant-form`.

---

## 5. Design tokens

Replace the `@theme` block in `apps/web/app/globals.css` with this. Values are a cool near-black ramp lifted from `apps/mobile/theme/` so the site reads as the same family as the app, with the brand blue re-tuned for dark backgrounds.

```css
@import "tailwindcss";

@theme {
  /* ── Surfaces ─────────────────────────────────────────────── */
  --color-bg:            #0a0b0d;  /* page ground */
  --color-surface:       #14161a;  /* cards, panels */
  --color-surface-2:     #1c1c1e;  /* raised panels — mobile app value */
  --color-ink:           #000000;  /* signature full-bleed band — mobile app value */

  /* ── Text ─────────────────────────────────────────────────── */
  --color-text:          #ffffff;
  --color-muted:         #8e8e93;  /* body copy — mobile app value — 6.04:1 */
  --color-subtle:        #636366;  /* METADATA AND ICONS ONLY — 3.29:1, fails AA for body */

  /* ── Borders ──────────────────────────────────────────────── */
  --color-border:        rgba(255, 255, 255, 0.08);
  --color-border-strong: rgba(255, 255, 255, 0.16);

  /* ── Action (primary buttons) ─────────────────────────────────
     White on black, matching apps/mobile/theme/dark-theme.ts
     btnPrimary/btnPrimaryText. 19.7:1. White means act.          */
  --color-action:        #ffffff;
  --color-action-hover:  #ebebeb;  /* mobile app brandDark */
  --color-on-action:     #000000;

  /* ── Accent (links, active state, icons, data) ────────────────
     Blue means navigate or inform. It is never a button fill.    */
  --color-accent:        #2e96ff;  /* 6.49:1 on bg */
  --color-accent-hover:  #57acff;  /* 8.20:1 on bg */
  --color-accent-strong: #0b84f3;  /* brand mark only */
  --color-accent-soft:   rgba(46, 150, 255, 0.12);
  --color-on-accent:     #06070a;  /* 6.64:1 — for accent-filled chips */

  /* ── Status ───────────────────────────────────────────────── */
  --color-success:       #22c55e;  /* 8.64:1 */
  --color-success-soft:  rgba(34, 197, 94, 0.12);
  --color-warning:       #ff9500;  /* 8.95:1 — mobile app value */
  --color-warning-soft:  rgba(255, 149, 0, 0.12);
  --color-error:         #ff3b30;  /* 5.55:1 — mobile app value */
  --color-error-soft:    rgba(255, 59, 48, 0.12);

  /* ── Type ─────────────────────────────────────────────────── */
  --font-sans: var(--font-ibm-plex-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-ibm-plex-mono), ui-monospace, monospace;

  /* ── Radius ───────────────────────────────────────────────────
     Sharp throughout. The engineered-infrastructure read depends
     on it; do not reintroduce rounding.                          */
  --radius-input:  0px;
  --radius-card:   0px;
  --radius-panel:  0px;
  --radius-pill:   0px;

  /* ── Motion ───────────────────────────────────────────────── */
  --ease-out-custom: cubic-bezier(0.16, 1, 0.3, 1);
}

@layer base {
  html {
    scroll-behavior: smooth;
    /* Sticky header height, so anchor jumps don't hide under it */
    scroll-padding-top: 5rem;
  }

  body {
    margin: 0;
    /* Full-bleed bands are 100vw; clip keeps that from producing a horizontal
       scrollbar. `clip` rather than `hidden` so position:sticky still works. */
    overflow-x: clip;
    background: var(--color-bg);
    color: var(--color-text);
    font-family: var(--font-sans);
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  ::selection {
    background: var(--color-accent-soft);
    color: var(--color-text);
  }

  h1, h2, h3, h4, p, figure, blockquote { margin: 0; }
  ul, ol { margin: 0; padding: 0; list-style: none; }
  a { color: inherit; text-decoration: none; }

  /* Mono figures must align when stacked in a column */
  .tabular { font-variant-numeric: tabular-nums; }

  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
}

@layer components {
  /* Masked grid backdrop — depth and technical texture with no gradient fill.
     Adapted from the Stitch hero. Purely decorative; always aria-hidden. */
  .grid-backdrop {
    background-image:
      linear-gradient(to right,  rgba(255, 255, 255, 0.035) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
    background-size: 48px 48px;
    -webkit-mask-image: radial-gradient(ellipse 75% 55% at 50% 12%, #000 30%, transparent 78%);
    mask-image: radial-gradient(ellipse 75% 55% at 50% 12%, #000 30%, transparent 78%);
  }

  .grid-backdrop-bottom {
    background-image:
      linear-gradient(to right,  rgba(255, 255, 255, 0.02) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
    background-size: 64px 64px;
    -webkit-mask-image: radial-gradient(ellipse 65% 50% at 50% 100%, #000 20%, transparent 80%);
    mask-image: radial-gradient(ellipse 65% 50% at 50% 100%, #000 20%, transparent 80%);
  }

  /* The single permitted radial. Accent at 6%, no violet, no second stop colour. */
  .hero-glow {
    background: radial-gradient(
      circle at 50% 12%,
      rgba(46, 150, 255, 0.06) 0%,
      rgba(46, 150, 255, 0.02) 45%,
      transparent 70%
    );
  }
}
```

### 5.1 Three non-obvious decisions

**Primary buttons are `--color-on-action` on `--color-action` — black on white, not blue.** This changed during implementation. White on `#0b84f3` measures **3.74:1**, below AA (a bug that existed in the previous light build too), and white on any usable blue fails. Black on white is **19.7:1**, and it matches the mobile app's own `btnPrimary: palette.white` / `btnPrimaryText: palette.black` (`apps/mobile/theme/dark-theme.ts:42-43`). Blue narrows to links, active nav, icons, focus rings and data highlights. **White means act, blue means navigate or inform.**

**Radius is `0` everywhere.** Also changed during implementation. The earlier radius-by-role scheme (pill / 16 / 28 / 10, lifted from the app) was replaced by sharp corners throughout — it is what makes the page read as engineered infrastructure. The radius tokens remain declared, set to `0px`, so any `rounded-card` usage stays square.

**`--color-subtle` (`#636366`) must never carry body text.** It measures **3.29:1** on `--color-bg` — fine for a decorative mono numeral, a metadata line, or an icon, but it fails AA for anything a reader needs. Body copy is always `--color-muted` (6.04:1). This is inherited from the app's `textTertiary`, where it is used at small sizes on a phone; at web sizes it does not hold up.

## 6. Typography, radius, elevation

### 6.1 Type scale

| Role | Size / line-height | Weight | Tracking | Colour |
|---|---|---|---|---|
| Display (hero `/` only) | 56px / 1.05 | 700 | −0.03em | `text` |
| H1 | 40px / 1.1 | 700 | −0.02em | `text` |
| H2 | 30px / 1.2 | 600 | −0.02em | `text` |
| H3 | 20px / 1.3 | 600 | — | `text` |
| Body | 16px / 1.6 | 400 | — | `muted` |
| Body emphasis | 16px / 1.6 | 500 | — | `text` |
| Small | 14px / 1.5 | 400 | — | `muted` |
| Label | 12px / 1.2 | 500 | 0.08em, uppercase | `subtle` |
| Mono figure | 20–40px | 500 | −0.01em | `text` |
| Mono meta | 13px | 400 | — | `subtle` |

Mobile: Display → 36px, H1 → 30px, H2 → 24px. Four weights total (400/500/600/700); 700 is display and H1 only.

**IBM Plex Mono is mandatory** for every currency amount, count, percentage, timestamp, date, ID, field name, type name and code label. Add `.tabular` wherever mono figures stack in a column. This is the single strongest brand signal on the site — `brand.md`'s rule that mono is for "amounts, identifiers, and activity records" carries over, widened to all figures.

Note: `brand.md` says "do not use negative letter spacing". **Reversed.** The mobile app's own scale uses `display: -1` and `h1: -0.3` tracking, and tight display tracking is what keeps a dark stark-minimal page from reading as a template.

### 6.2 Radius — sharp throughout

Everything is square: buttons, cards, chips, inputs, panels. The only rounded thing on the site is a decorative status dot.

```css
--radius-input: 0px;  --radius-card:  0px;
--radius-panel: 0px;  --radius-pill:  0px;
```

Updated class constants, exported from `components/site/primitives.tsx`:

```ts
export const linkFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

const buttonBase =
  "inline-flex h-12 min-h-12 items-center justify-center gap-2 border px-8 font-mono text-[13px] font-bold uppercase tracking-[0.08em] transition-colors duration-200";

export const primaryButtonClass   = `${buttonBase} border-action bg-action text-on-action hover:bg-action-hover ...`;
export const secondaryButtonClass = `${buttonBase} border-border-strong bg-transparent text-text hover:border-text ...`;
export const tertiaryLinkClass    = `inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-accent hover:text-accent-hover ...`;
```

Buttons are **uppercase mono with wide tracking** — it separates actions from links at a glance and reinforces mono-as-brand.

### 6.3 Elevation

Elevation comes from **background shade**, not shadow: `--color-ink` < `--color-bg` < `--color-surface` < `--color-surface-2`.

Exactly one shadow is permitted site-wide — the hero product panel on `/`:

```css
box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
```

That's the mobile app's balance-card value. Nothing else gets a shadow. No `backdrop-filter` except the sticky header's blur.

**No gradient fills** on any surface, text or button.

Two texture exceptions, defined as classes in `app/globals.css` so no component carries colour literals:

- `.grid-backdrop` — a 48px grid of white hairlines at 3.5%, radial-masked to fade before it reaches content. Adapted from the Stitch hero; it gives the flat dark page depth without colour. Rendered by `<GridBackdrop />`, always `aria-hidden`.
- `.hero-glow` — one accent radial at ≤6%. No violet, no second hue.

**Full-bleed bands use `w-screen`**, which is wider than the content box whenever a classic scrollbar is present. `body { overflow-x: clip }` prevents the resulting horizontal scrollbar — `clip` rather than `hidden`, so `position: sticky` on the header keeps working.

---

## 7. Interactive components

None of the 8 PDFs specify a single interaction state. These are the contracts.

### 7.1 State matrix

| Component | Default | Hover | Focus-visible | Active/pressed | Disabled | Loading |
|---|---|---|---|---|---|---|
| Primary button | `bg-action` / `text-on-action` | `bg-action-hover` | 2px accent ring, 2px offset on `bg` | `opacity-90`, no transform | `bg-surface-2` / `text-subtle`, `cursor-not-allowed`, `aria-disabled` | label swaps for a 16px spinner + "Sending…", button width locked, `aria-busy="true"` |
| Secondary button | transparent / `border-border-strong` | `border-text` / `bg-white/[0.06]` | as above | `opacity-90` | `border-border` / `text-subtle` | as above |
| Tertiary link | `text-accent` | `text-accent-hover`, chevron `translate-x-0.5` | as above | — | `text-subtle` | — |
| Card (static) | `bg-surface` / `border-border` | — | — | — | — | — |
| Card (linked) | `bg-surface` / `border-border` | `border-border-strong`, inner link → `text-accent-hover` | ring on the anchor, not the card | — | — | — |
| Nav item | `text-muted` | `text-text` | as above | — | — | — |
| Nav item (current) | `text-text` + 2px `bg-accent` underline | — | as above | — | — | — |
| Input / textarea | `bg-bg` / `border-border-strong` / `text-text` | `border-white/24` | `border-accent` + 2px accent ring, 2px offset | — | `bg-surface` / `text-subtle` | `readOnly`, spinner in the trailing slot |
| Input (error) | `border-error` + 13px `text-error` message below | — | ring becomes `ring-error` | — | — | — |
| Input (valid, after blur) | `border-success` + small success check in the trailing slot | — | — | — | — | — |
| Checkbox | `border-border-strong`, empty | `border-accent` | ring on the box | — | `border-border`, `text-subtle` label | — |
| Checkbox (checked) | `bg-accent` + `text-on-accent` check | `bg-accent-hover` | as above | — | `bg-surface-2` + `text-subtle` check | — |
| Segment (inactive) | transparent / `text-muted` | `text-text` | ring inside the container | — | `text-subtle` | — |
| Segment (active) | `bg-accent` / `text-on-accent` | `bg-accent-hover` | as above | — | — | — |
| Accordion row | `text-text` question, `text-subtle` plus icon | question stays, icon → `text-accent` | ring on the whole row | — | — | — |
| Accordion (open) | icon rotates to minus, answer in `text-muted` | — | — | — | — | — |
| Status chip | tinted fill + matching border and text | — | — | — | — | — |
| Flow-diagram box (linked) | `bg-surface` / `border-border` | `border-accent`, arrow into it brightens | ring on the box | — | — | — |

**Focus rings are never removed.** Use `focus-visible`, never `focus`, so mouse users don't see rings but keyboard users always do.

**Result and empty states:**

| Surface | State | Behaviour |
|---|---|---|
| Any form | success | Replace the form panel with a success panel: green check, H3 confirmation, one body line, tertiary link back. Do **not** use a toast — the panel must persist. Move focus to the success heading. |
| Any form | server error | Keep all entered values. Show an error panel above the submit button: `border-error`, red icon, "Something went wrong on our side. Please try again, or email hello@mcbuse.com." Submit stays enabled. |
| Any form | validation error | Inline per field, `aria-describedby` linking input to message, `aria-invalid="true"`. Focus moves to the first invalid field. Never block submit on client validation alone — validate on submit, not on keystroke. |
| Eligibility check | unanswered | Submit disabled with `aria-disabled`, plus 13px `text-subtle` hint "Answer all three questions to check." |
| Video card | no video URL configured | Poster frame stays, play button is replaced by a secondary button "Request the demo video" → mailto via `linkOrRequestAccess()`. |
| Data-field table | — | Never empty; the eight rows in §7.4 are static content. |

### 7.2 Contact form — segmented routing

One form, three field sets. The segment selector swaps the field set without a page load; the URL hash updates so the three legacy anchors keep working.

| Segment | Hash | Fields | Submit label |
|---|---|---|---|
| Merchant pilot | `#merchant-form` | Name\* · Business name\* · Target city\* (Berlin / Munich / Elsewhere) · Contact email\* · Contact phone · Interested in QR or NFC? (Yes/No, pill radios) · Message · Consent\* | Submit pilot application |
| Partner enquiry | `#partner-form` | Name\* · Company or institution\* · Role or title\* · Corporate email\* · Partner type\* (Bank / Fintech / PSP / Investor / Other) · Core integration goals\* (textarea) · Consent\* | Request a discovery call |
| General waitlist | `#waitlist-form` | Name\* · Email\* · I am a\* (Merchant / Partner / Investor / Developer / Other) · Consent\* | Join the waitlist |

\* = required. Fields marked required carry a small `text-accent` asterisk and `required` + `aria-required="true"`.

Behaviour:
- Landing on `/contact#partner-form` pre-selects the Partner segment and moves focus to its first field.
- Switching segments preserves any shared values already entered (name, email).
- The segment control is a real `role="tablist"` with `role="tab"` children and `aria-selected`, and the panel is `role="tabpanel"` with `aria-labelledby`. Arrow keys move between segments.
- Consent copy, per segment:
  - Merchant — "I consent to MCBuse processing this information for pilot evaluation. I can withdraw consent at any time."
  - Partner — "I consent to MCBuse processing this business contact information for partnership discussions."
  - Waitlist — "I consent to MCBuse sending me product updates. I can unsubscribe at any time."
- Below the submit button: "We reply within two working days. Or email hello@mcbuse.com directly."

**Validation copy** — use these exact strings:

| Condition | Message |
|---|---|
| Required, empty | "This field is required." |
| Email malformed | "Enter a valid email address." |
| Partner email is a free provider | "Please use your work email address." (warning, non-blocking) |
| Phone malformed | "Enter a valid phone number, or leave this blank." |
| Consent unchecked | "We need your consent to process this." |
| Select unchosen | "Choose an option." |

### 7.3 Eligibility check (`/merchants#eligibility`)

The PDF spec was one line. Full contract:

**Inputs** — three Yes/No pill radio pairs plus one select:
1. "Is your average sale between EUR 0.10 and EUR 10.00?"
2. "Do you take many small payments on a typical day?"
3. "Do you have an NFC-capable smartphone or terminal?"
4. Select: "Where are you based?" → Berlin · Munich · Elsewhere in Germany · Outside Germany

**Logic** — purely client-side, nothing stored, no network request:

| Condition | Result |
|---|---|
| All three Yes **and** city is Berlin or Munich | **Strong fit.** Green check. "You look like a good fit for the Berlin and Munich pilot." Body: "The pilot focuses on high-frequency, low-ticket merchants in these two cities." Primary button "Apply to the pilot" → `/contact#merchant-form`. |
| All three Yes **and** city is elsewhere | **Fit, wrong geography.** Amber dot. "Your business fits — your city isn't in the first pilot yet." Body: "We're starting in Berlin and Munich. Join the waitlist and we'll tell you when we expand." Primary button "Join the waitlist" → `/contact#waitlist-form`. |
| Any No on Q1 or Q2 | **Not the current focus.** Neutral. "The pilot is built for very high-frequency, low-ticket sales." Body: "If that's not your pattern yet, the waitlist is still the right place — the product will widen." Secondary button "Join the waitlist". |
| No on Q3 only | **Hardware gap.** Amber dot. "You'll need an NFC-capable device to take part." Body: "Most recent Android phones qualify. Get in touch if you're not sure." Secondary button "Ask us about hardware" → `/contact#merchant-form`. |

**Presentation** — the result renders as a bordered inset panel *inside the same card*, directly beneath the button. Do not use a modal, and do not navigate. The result region is `aria-live="polite"` and focus moves to its heading on reveal. The button label changes to "Check again" once a result is showing, and changing any answer clears the result.

### 7.4 Partner data-field table (`/partners#data-fields`)

Static content, rendered as a real `<table>` with a `<caption>`. Three columns: FIELD (mono), TYPE (mono, `text-subtle`), LEVEL (chip). Hairline row separators, no zebra striping.

| field | type | level |
|---|---|---|
| `merchant_id` | string | L1 |
| `city` | string | L1 |
| `merchant_category` | enum | L1 |
| `active_days_count` | integer | L2 |
| `transaction_count_30d` | integer | L2 |
| `avg_ticket_value` | decimal | L2 |
| `payout_exception_rate` | decimal | L2 |
| `readiness_status` | enum | L2 |

Preamble copy: "Fields are classified under our internal data-classification framework. Only classification levels 1 and 2 are ever surfaced to a partner. Levels 3 to 5 remain internal-only."

Note beneath, with a lock icon in `text-subtle`: "Individual merchant records are released only with that merchant's explicit authorization. MCBuse is a trusted data partner, not a data broker."

**These field names are illustrative of shape, not a committed API contract.** Confirm them with the data owner before publishing, and label the section "Illustrative — subject to change" if they aren't yet settled.

---

## 8. Motion

| Transition | Duration | Easing |
|---|---|---|
| Entrance (mount, reveal, accordion open) | 300ms | `--ease-out-custom` |
| Exit (accordion close, dismiss) | 200ms | `--ease-out-custom` |
| Hover / focus colour and border | 200ms | `ease-out` |
| Segment switch (panel cross-fade) | 120ms | `ease-out` |

Entry is deliberately longer than exit. No bounce, no spring overshoot, no parallax, no scroll-triggered reveal chains, no scroll-jacking, no autoplaying video, no looping background animation.

Never use `transition: all` or Tailwind's `transition-all` — always name the properties (`transition-colors`, `transition-[border-color,color]`).

All of it sits behind the `prefers-reduced-motion` block in §5.

---

## 9. Forms, links and analytics

### 9.1 Link readiness

`components/landing/constants.ts` already holds the right pattern. **Six of seven URLs are empty strings** — only `pilot` is set, pointing at a Tally form:

```ts
export const EXTERNAL_LINKS = {
  pilot:       "https://tally.so/r/mcbuse-pilot",
  partnerCall: "",   // Calendly — not yet created
  waitlist:    "",
  pitchVideo:  "",
  demoVideo:   "",
  apk:         "",
  pitchDeck:   "",
  contact:     `mailto:${CONTACT_EMAIL}`,
};
```

`linkOrRequestAccess(url, subject)` already degrades an empty URL to a pre-filled mailto. **This is intentional and correct — keep it.** Every CTA whose URL isn't set must route through it rather than rendering a dead link or a `#`. Use `hasConfiguredUrl()` to decide whether to show a play button or a "Request the demo video" button on `/demo`, and `outboundProps()` for `target`/`rel` on external links.

Contact email: `hello@mcbuse.com`.

### 9.2 Submission — what shipped

There is no backend endpoint and no form service, so all four forms (three contact segments plus sandbox access) route through **`components/site/submitIntake.ts`**. `buildIntakeMailto()` composes a pre-filled mail draft carrying every field **and the exact consent string that was shown**, plus an ISO timestamp. Same degradation philosophy as `linkOrRequestAccess()`.

This is deliberate: faking a success state would be worse than an honest hand-off. The success panel says plainly that a pre-filled email was opened and gives the address as a fallback.

**To replace it:** swap the body of `buildIntakeMailto()` for a server action that POSTs to `apps/api` and persists `{ fields, consentText, consentedAt }`. Nothing in the form components needs to change. Store the consent **string and timestamp**, not just a boolean — that is the record that matters if consent is ever queried.

### 9.3 Analytics

Per `web.md:730-739` — PostHog or Plausible. Track these named events:

`cta_join_pilot` · `cta_watch_demo` · `cta_partner_call` · `cta_download_deck` · `cta_request_apk` · `cta_contact` · `eligibility_check_run` (with the result bucket) · `form_submit` (with the segment) · `segment_switch` · `faq_open` (with the question).

No third-party analytics before a cookie-consent decision — see §12.

---

## 10. Accessibility

Target: **WCAG 2.2 AA**.

### 10.1 Measured contrast

Against `--color-bg` (`#0a0b0d`) unless stated. All values measured, not estimated:

| Pair | Ratio | Verdict |
|---|---|---|
| `text` `#ffffff` on `bg` | 19.69:1 | ✅ |
| `muted` `#8e8e93` on `bg` | 6.04:1 | ✅ body text |
| `muted` `#8e8e93` on `surface` `#14161a` | 5.56:1 | ✅ body text |
| `subtle` `#636366` on `bg` | 3.29:1 | ❌ **decorative, metadata and icons only — never body text** |
| `accent` `#2e96ff` on `bg` | 6.49:1 | ✅ links and icons |
| `on-accent` `#06070a` on `accent` | 6.64:1 | ✅ primary button |
| `success` `#22c55e` on `bg` | 8.64:1 | ✅ |
| `warning` `#ff9500` on `bg` | 8.95:1 | ✅ |
| `error` `#ff3b30` on `bg` | 5.55:1 | ✅ |
| ~~white on `accent-strong` `#0b84f3`~~ | 3.74:1 | ❌ **the reason primary buttons use near-black text** |
| `accent-hover` `#57acff` on `bg` | 8.20:1 | ✅ |
| `accent` `#2e96ff` on `ink` `#000000` | 6.92:1 | ✅ |
| `muted` `#8e8e93` on `surface-2` `#1c1c1e` | 5.22:1 | ✅ body text |

`border` at `rgba(255,255,255,0.08)` is decorative only. Any border that conveys state — focus, error, selection — must use `border-strong`, `accent`, or `error`.

### 10.2 Requirements

- **Focus:** every interactive element gets `focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-bg`. Never `outline: none` without a replacement.
- **Targets:** minimum 44×44px. `min-h-11` is already the convention in `Section.tsx`; buttons move to `min-h-12` (48px).
- **Headings:** exactly one `<h1>` per route. No level skipped. Section eyebrows are `<p>`, not headings.
- **Landmarks:** `<header>`, `<nav aria-label="Main">`, `<main>`, `<footer>`. A skip-to-content link as the first focusable element on every page.
- **Status is never colour alone:** every status chip pairs its colour with a word ("Captured", "Pending", "Failed") and an icon.
- **Icons:** decorative icons get `aria-hidden`. An icon that is the only content of a control gets an `aria-label`.
- **Forms:** every input has a visible `<label>` with `htmlFor`. Errors use `aria-describedby` + `aria-invalid`. Never placeholder-as-label.
- **Live regions:** the eligibility result and every form success/error panel are `aria-live="polite"`.
- **Accordions:** `<button aria-expanded>` controlling a panel by `aria-controls`.
- **Mono figures:** `font-variant-numeric: tabular-nums` wherever they stack, so columns align.
- **Reduced motion:** honoured globally per §5.
- **Zoom:** the layout must survive 200% browser zoom and a 320px viewport without horizontal scroll. Wide content (the data-field table, any code block) scrolls inside its own `overflow-x-auto` container; the page body never scrolls sideways.

### 10.3 Alt text

| Image | Alt |
|---|---|
| Hero product panel | "MCBuse mobile app showing a EUR 3.40 payment request with a QR code and recent captured transactions." |
| Merchant dashboard mockup | "Merchant dashboard with today's sales of EUR 412.80 across 137 transactions, an hourly sales chart, an expected payout, and a credit-readiness indicator. Sample data." |
| Monogram avatars | `""` — decorative; the name is adjacent text. |
| Flow diagram | Render as text + SVG, not an image. The four labels are real text. |
| Video poster | "Play the MCBuse product walkthrough, 3 minutes." on the button; the poster itself is `aria-hidden`. |

---

## 11. SEO and metadata

Use the App Router `metadata` export per route. Site name "MCBuse". No `og-image` files exist yet — generate them with `next/og` from the route title on a `#0a0b0d` ground with the monogram, so they never go stale.

| Route | `<title>` | Meta description |
|---|---|---|
| `/` | MCBuse — Merchant Financial Visibility for Low-Ticket Payments | MCBuse turns everyday low-ticket merchant payments into structured financial records — analytics merchants can use, and evidence institutions can verify. |
| `/product` | Product & Systems — MCBuse | Four modules that turn QR, NFC and stablecoin payment events into structured merchant records, business analytics and credit-readiness indicators. |
| `/merchants` | For Micro-Merchants — MCBuse | Accept payments, see your daily sales rhythm and payout status, and build a business record you can share with a lender. Pilot open in Berlin and Munich. |
| `/partners` | For Banks, Fintechs and PSPs — MCBuse | Structured merchant activity data and credit-readiness indicators for underserved low-ticket segments — supporting, not replacing, your underwriting. |
| `/roadmap` | Roadmap — MCBuse | Four phases from MVP foundation to partner-facing profile access, plus how the business model works. |
| `/demo` | Sandbox Demo — MCBuse | Test data-capture parameters and dashboard alerts against simulated transaction feeds in the MCBuse sandbox. |
| `/contact` | Contact — MCBuse | Apply to the merchant pilot, request a partner discovery call, or join the waitlist. |
| `/company` | Company — MCBuse | The cross-functional team building structured financial visibility for micro-merchants. |

Also: `metadataBase`, canonical per route, `robots.txt`, a `sitemap.ts` covering all 11 routes, and `lang="en"` on `<html>`.

**Keywords to target** (from `web.md:758-769`, minus the banned terms): low-ticket payments · merchant activity data · QR payment infrastructure · NFC payments · merchant data infrastructure · financial visibility · stablecoin payment infrastructure · credit readiness.

Do **not** use `web.md`'s suggested homepage title — "MCBuse | Micro-Banking Infrastructure for Financial Visibility" — "micro-banking" is on the banned list in §2.

---

## 12. Legal and compliance items

Not blockers for design, but they must be resolved before a public launch.

1. **Impressum.** German law requires a legal notice on a commercial site aimed at Germany. `docs/team_plan.md` shows incorporation is still an open work item, so this route ships as a stub with the placeholder "Impressum details will be published on incorporation." Fill it in with the entity name, legal form, registered address, register number, VAT ID and a responsible contact as soon as they exist.
2. **Cookie consent.** GDPR applies from the first Berlin/Munich visitor. Do not load any third-party analytics or embed before consent. Cheapest compliant path: a self-hosted, cookieless analytics setup and no banner at all. If you use anything that sets a cookie, a real consent banner with a genuine reject option is required.
3. **Privacy policy and terms** currently exist only as footer links. They need real content covering: what payment-event data is captured, the legal basis (consent), retention, the merchant's rights, who data is shared with and under what authorization, and processor details.
4. **Third-party logos.** `web.md:451` flags that permission is unconfirmed for Colosseum, Solana, Superteam, Stripe and university marks. No logo wall until each is cleared in writing.

---

## 13. Asset readiness

| Asset | Status | Owner | Interim behaviour |
|---|---|---|---|
| **Logo + wordmark** | **Missing.** No logo file exists anywhere in this repo — `apps/mobile/assets/images/` is all Expo placeholder art, `apps/web/public/` is all Next/Turborepo boilerplate. | Berk | `#2e96ff` monogram tile with an `#06070a` "M", plus "MCBuse" in IBM Plex Sans 600. **Top blocking asset.** |
| Favicon + app icons | Default Next favicon | Berk | Monogram-derived, generated once the logo exists |
| OG images | None | — | Generated at build with `next/og` |
| Team photos | None | Asim | Monogram avatars in accent tint. Do **not** substitute stock or AI-generated portraits. |
| Product screenshots | None | Frederick | Hand-built dark mockup components, captioned B9 |
| Merchant photography | None | Berk | **Deliberately omitted.** No stock café or shopkeeper imagery — it's a strong generic-template signal and these are not real pilot merchants. |
| Demo + pitch video | Not recorded | Frederick | Poster frame; play button degrades to a mailto request |
| Pitch deck PDF | Not available | Asim | Button degrades to a mailto request |
| Test APK | Prototype exists | Frederick | Request-only, never a direct public download |
| Icons | **Available.** 553 single-colour 24×24 SVGs across 56 categories in `/Users/fred/Documents/Projects/mcbuse/icons/`, recolourable via `fill`. Plus `lucide-react`. | — | Use lucide first; reach for the SVG set for payment, NFC, scan, analytics and security glyphs lucide lacks |
| Partner / ecosystem logos | Permission unconfirmed | Asim | Omitted |

One note on `/Users/fred/Documents/Projects/mcbuse/images/`: it holds 236 Cash App iOS screenshots, the reference set the mobile app's tokens were reverse-engineered from. Useful as a craft reference for dark-UI detail. **But the website must not inherit Cash App's consumer look** — its readers are banks and PSPs, and the app's monochrome black-and-white system is deliberately not what this site uses.

---

## 14. Acceptance criteria

### Content
- [ ] Every banned term in §2 returns **zero** matches when grepped across `apps/web` (excluding this document).
- [ ] All four canonical module names appear exactly as written in §2.
- [ ] Boundary statement B1 or its per-route override, plus B2, appear in the footer of all 11 routes.
- [ ] B7 appears in the homepage hero; B8 appears beside every mention of readiness; B9 appears beside every dashboard mockup.
- [ ] Every remaining occurrence of "credit score", "guaranteed", "approval" or "approved" is either
      an explicit negation ("does not produce a credit score", "not a guaranteed connection") or
      describes a *partner* accountability ("approvals … remain with licensed partners", "approved
      stablecoin issuers"). Never a claim MCBuse makes about a merchant. See §2.1.

### Design system
- [ ] `apps/web/app/globals.css` matches §5 exactly (§5 is generated from the shipped file).
- [ ] `grep -rn "#[0-9a-fA-F]\{6\}" apps/web/components apps/web/app --include=*.tsx` returns nothing — no inline hex, tokens only.
- [ ] `grep -rn "transition-all\|transition: all" apps/web` returns nothing.
- [ ] IBM Plex Sans and IBM Plex Mono load via `next/font/google`; the Geist `.woff` files and their `localFont` declarations are gone.
- [ ] Every currency amount, count, timestamp and field name renders in mono, and every button label is uppercase mono.
- [ ] Radius is `0` everywhere. `grep -rn "rounded-" app components` returns only the decorative status dot.
- [ ] No element has a `box-shadow`. Elevation is background shade only.
- [ ] No gradient fill anywhere. The only gradient functions are the `.grid-backdrop` hairlines, its radial mask, and the ≤6% `.hero-glow`.

### Accessibility
- [ ] axe DevTools: zero violations on all 11 routes.
- [ ] Keyboard-only pass on `/contact` and `/merchants#eligibility` — every control reachable, focus always visible, focus order matches reading order.
- [ ] Screen-reader pass on the segmented form and the eligibility result: segment changes and results are announced.
- [ ] `--color-subtle` never applied to a `<p>` or any body-text node.
- [ ] 320px viewport and 200% zoom: no horizontal page scroll on any route.
- [ ] `prefers-reduced-motion: reduce` disables every transition.

### Function
- [ ] All three form segments submit, persisting the consent string and a timestamp.
- [ ] All seven redirects in §4 resolve.
- [ ] All four eligibility outcomes in §7.3 reachable, with nothing sent over the network.
- [ ] Every unconfigured `EXTERNAL_LINKS` entry degrades to a mailto — no dead links, no `href="#"`.
- [ ] All ten analytics events fire.
- [ ] Lighthouse ≥ 95 on Performance, Accessibility, Best Practices and SEO for `/`.

### Taste
- [ ] The homepage has **no** row of three identical icon-heading-paragraph cards.
- [ ] The hero is asymmetric, not centred.
- [ ] Zero coins, chains, wallets, hexagons, node networks, glassmorphism or glowing orbs.
- [ ] Zero stock photography.
- [ ] Blue never fills a button. It appears only as link, active state, icon, focus ring or data highlight.
- [ ] The convergence test: show it to someone and ask whether they'd believe an AI generated it. If yes, revisit §1 of the Stitch file rather than polishing.
