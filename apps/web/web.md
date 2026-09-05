# MCBuse Website — Structure

Structure and scope for the MCBuse public website. Dark theme, multi-route.

> **Authority.** This file describes *what pages exist and what goes on them*. The implementation contract — tokens as code, component contracts, interaction states, form schemas, accessibility, SEO, acceptance criteria — is `../../docs/website-plan/mcbuse-website-handover.md`. Body copy and per-screen visual spec are in `../../docs/website-plan/mcbuse-stitch-prompts.md`. Brand palette, type and visual rules are in `./brand.md`. Where any of them disagree with this file, they win.
>
> **This replaces the previous one-page, light-theme spec.** That version proposed a single scrolling page with 15 anchor sections in a blue/white palette. It was superseded on 2026-09-04 by a dark multi-route site. The previous revision is recoverable from git history (`git log -- apps/web/web.md`); the parts still worth having are preserved in the appendix at the bottom of this file.

## 1. Website goal

The public-facing company website for MCBuse — not a single grant or hackathon page. It serves:

- Merchant pilot applicants
- Banks, fintechs, PSPs and payment partners
- Investors
- Grant, accelerator and ecosystem reviewers
- Hackathon and blockchain ecosystem visitors
- Early users who want to try the sandbox or join the waitlist

It must clearly explain what MCBuse is, why it exists, what problem it solves, how the demo works, who the founders are, and how merchants and partners can join the pilot.

## 2. Positioning — locked

| | |
|---|---|
| **Title** | MCBuse — Financial Intelligence for Underserved Commerce |
| **Tagline** | Turning stablecoin commerce into merchant financial intelligence. |
| **One-liner** | MCBuse turns everyday low-ticket merchant payments into structured financial records — analytics merchants can use, and evidence institutions can verify. |
| **Homepage H1** | From low-ticket payments to merchant financial visibility |
| **Long-term vision** | Over time, MCBuse will become the trusted distribution and payments infrastructure through which approved stablecoin issuers can reach merchants and consumers — while the resulting data network supports better financial decisions. |

Source: `../../docs/colosseum-hackathon-non-technical-brief.md` §8. Do not paraphrase these.

## 3. Tone

Professional, clear, trustworthy, partner-friendly. Simple enough for merchants, strong enough for investors and banks. Not crypto-heavy.

Never imply the product is fully regulated or market-proven while it is at MVP, sandbox and pilot-preparation stage.

**A locked lexicon governs all copy** — approved terms, banned terms, and the exact phrasing for each of the four modules. See handover §2 before writing anything. Banned terms include "micro-banking", "credit score", "automated underwriting", "lending platform", "approved" and "guaranteed"; §2.1 covers the cases where they remain correct (inside a negation, or describing a partner's accountability).

## 4. Navigation

Header: `Product · Merchants · Partners · Roadmap · Company`

One primary CTA in the header: **Join the Pilot** → `/contact#merchant-form`

`Watch Demo` is not a header button — it lives in the homepage hero and on `/demo`. Five nav items and a single primary CTA, not seven items and two competing buttons.

## 5. Routes

| Path | Purpose | Primary CTA | Copy source |
|---|---|---|---|
| `/` | Positioning, audience fork, problem, solution, value, boundary | Join the Pilot | stitch §2 |
| `/product` | The four modules, why verifiable records, 7-step flow | Request sandbox access | stitch §3 |
| `/merchants` | Merchant value prop, benefits, eligibility check, market entry, FAQ | Join the Pilot | stitch §4 |
| `/partners` | B2B value prop, accountability split, data fields, governance, FAQ | Schedule a partner call | stitch §5 |
| `/roadmap` | Four phases, business model, vision | Join the waitlist | stitch §6 |
| `/demo` | Sandbox explainer, video, access request, prototype build | Request access | stitch §7 |
| `/contact` | Routed intake form (three segments) | per segment | stitch §8 |
| `/company` | Mission, team, how we communicate | Join the Pilot | stitch §9 |
| `/privacy` | Privacy policy | — | to be written |
| `/terms` | Terms of use | — | to be written |
| `/impressum` | German legal notice — required once incorporated | — | to be written |

Redirects preserving the old one-page anchors: `/#product → /product`, `/#demo → /demo`, `/#merchants → /merchants`, `/#partners → /partners`, `/#about → /company`, `/#contact → /contact`, `/#sandbox → /demo#sandbox`.

## 6. Section outlines

Copy for every section is in the Stitch file. This is the running order.

**`/`** — Hero (asymmetric 7/5, product panel right) · Audience split (merchant vs institution) · The problem (3 asymmetric rows, opening on the merchant pull-quote) · The solution (4-box flow diagram → `/product`) · Value snapshot (2×2, mono figures) · Boundary and trust (what MCBuse provides vs what licensed partners handle) · Final CTA strip

**`/product`** — Hero · The four modules (2×2: Payment Capture, Business Analytics, Credit-Readiness, Institutional Matching, each with a boundary note) · Why verifiable records (stablecoins named in copy, no crypto imagery) · How it works (7-step vertical timeline)

**`/merchants`** — Hero (dashboard mockup right) · What you'll see (9-item two-column checklist) · Eligibility check (interactive, 3 questions + city, 4 outcomes) · Where we're starting (Berlin and Munich) · FAQ (5 questions) · CTA strip

**`/partners`** — Hero · Accountability split (infrastructure layer vs regulated layer) · What the profile contains (Level 1–2 field table) · How the data is governed (consent, merchant control, verifiability, minimization) · FAQ (4 questions) · CTA strip

**`/roadmap`** — Hero · Four phases (Now / Now / Next / Later, current position marked) · How the business works (B2B licensing, partner access, merchant analytics) · Vision · CTA strip

**`/demo`** — Hero (sandbox status chip) · Video card · What you can try (4 rows) · Request access (form + prototype build panel) · Sandbox disclaimer

**`/contact`** — Hero · Routed form (segmented control: merchant pilot / partner enquiry / general waitlist) · Other ways to reach us

**`/company`** — Mission · Team (3 monogram cards) · How we talk about what we're building · CTA strip

## 7. Forms

One form on `/contact` with a three-way segment selector, not three parallel forms. Field schemas, validation copy, consent strings and ARIA requirements are in handover §7.2.

| Segment | Anchor | Submit |
|---|---|---|
| Merchant pilot | `#merchant-form` | Submit pilot application |
| Partner enquiry | `#partner-form` | Request a discovery call |
| General waitlist | `#waitlist-form` | Join the waitlist |

A fourth, separate form on `/demo#access` requests sandbox access and the prototype build.

Store the consent boolean **with a timestamp and the exact consent string shown** — not just `true`. That is the record that matters if consent is ever queried.

## 8. Technical

- **Next.js 16** App Router, React 19, TypeScript. Build into this app; do not scaffold a new one.
- **Tailwind CSS v4** — tokens in `@theme` in `app/globals.css`. No `tailwind.config.js`.
- **Fonts**: IBM Plex Sans + IBM Plex Mono via `next/font/google`. The Geist `localFont` declarations and the two `.woff` files in `app/fonts/` are to be removed.
- **Icons**: `lucide-react`, plus the local SVG set — see `brand.md`.
- **Animation**: not required. Every motion in the spec is achievable with CSS transitions. Add Framer Motion only if the accordion height spring needs it.
- **Content**: inline TSX for now. A CMS (Sanity, Strapi) only if non-engineers need to edit copy.
- **Forms**: a Next server action writing to `apps/api` is preferred over a third-party form service, because of the consent-record requirement. Tally is the fastest interim option and is already in use for the pilot form.
- **Performance**: optimize images, lazy-load video, use poster frames instead of autoplay, target Lighthouse ≥95 on `/`.
- **Existing components**: `components/landing/` holds 14 components from the previous one-pager. Restructure them into routes rather than rewriting. `Section.tsx` and its exported class constants, and `constants.ts` with its link helpers, are reused as-is. See handover §3.1 for the component → route mapping.

## 9. Analytics

PostHog or Plausible. No third-party analytics before a cookie-consent decision — see handover §12.

Events: `cta_join_pilot` · `cta_watch_demo` · `cta_partner_call` · `cta_download_deck` · `cta_request_apk` · `cta_contact` · `eligibility_check_run` · `form_submit` · `segment_switch` · `faq_open`

## 10. SEO

Per-route titles and meta descriptions are in handover §11. Also needed: `metadataBase`, canonical per route, `robots.txt`, `sitemap.ts` covering all 11 routes, and OG images generated at build with `next/og`.

Keywords: low-ticket payments · merchant activity data · QR payment infrastructure · NFC payments · merchant data infrastructure · financial visibility · stablecoin payment infrastructure · credit readiness

Do **not** use the previous homepage title "MCBuse | Micro-Banking Infrastructure for Financial Visibility" — "micro-banking" is a banned term.

## 11. Required assets

Full readiness table with owners is in handover §13. The short version:

| Asset | Status |
|---|---|
| Logo and wordmark | **Missing entirely — top blocking asset** |
| Team photos | Missing → monogram avatars |
| Product screenshots | Missing → hand-built mockup components |
| Merchant photography | Missing → deliberately omitted, no stock imagery |
| Demo and pitch video | Not recorded → poster frame, request button |
| Pitch deck PDF | Not available → mailto request |
| Test APK | Prototype exists → request-only, never a public download |
| Icons | **Available** — 553 SVGs locally, plus lucide-react |
| Partner / ecosystem logos | Permission unconfirmed → omitted |

Six of seven `EXTERNAL_LINKS` in `components/landing/constants.ts` are still empty strings. `linkOrRequestAccess()` already degrades those to a pre-filled mailto — that behaviour is intentional and should be kept, so no CTA ever renders as a dead link.

---

## Appendix — retired content

Kept from the previous revision because it is not carried anywhere else. Use it as raw material, not as spec.

**"Why MCBuse Exists" long-form copy.** Retired because the homepage now opens on the merchant's own words rather than a macro paragraph, but this is still the most complete statement of the founding motivation:

> Billions of people and small businesses transact every day, but much of this activity remains invisible to the formal financial system. Cash payments, informal lending, low-ticket purchases, delayed settlements, fragmented wallets, and repeated KYC/KYB checks create friction for users, merchants, and financial institutions. MCBuse was founded to make everyday financial activity visible, structured, and usable — starting with micro-transactions and merchant payment data.

**The "invisible economy" iceberg concept.** An above/below-waterline diagram — formal banking, structured records and verified data above; cash transactions, informal lending, low-ticket purchases, underbanked users, micro-merchants, gig workers and data poverty below. Retired because it is an abstract metaphor, and the current direction shows the data product rather than a metaphor for it. Worth revisiting for the pitch deck, where metaphor works harder than it does on a website.

**Ecosystem and validation blocks.** Colosseum Frontier Hackathon · Solana ecosystem · demo and sandbox validation · EXIST preparation · partner and pilot discussions. Retired from the site because displaying third-party marks needs written permission first. Re-add as a logo wall once each is cleared.

**Full revenue-stream list.** B2B licensing for banks, MFIs, fintechs and partners · transaction fees on micro and P2P transactions · activity-signal API subscriptions · aggregated data insights for partners · future cross-border remittance. The site shows only the first three, because the rest are further out than the roadmap claims and the aggregated-insights line needs careful wording against the "trusted data partner, not a data broker" position.

**P2P framing.** The previous spec described peer-to-peer financial behaviour as a co-equal capture surface alongside merchant payments. The current site is merchant-only, matching the actual MVP scope. Re-introduce when P2P capture is real.

**Alternative headlines considered.** "Turning Micro-Payments into Financial Visibility" · "From Low-Ticket Payments to Merchant Visibility" · "A QR/NFC-enabled payment and data infrastructure helping micro-merchants capture transactions, understand payouts, and build structured activity records."
