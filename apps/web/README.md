# MCBuse Web

The MCBuse public marketing website. Next.js 16 (App Router), React 19, Tailwind CSS v4, dark theme.

Part of the `v1.0` Turborepo monorepo alongside `apps/api` (NestJS) and `apps/mobile` (Expo).

## Getting started

From the repo root:

```bash
pnpm install
pnpm dev --filter web
```

Or from this directory:

```bash
pnpm dev          # next dev --webpack, port 3000
pnpm build        # next build --webpack
pnpm lint         # eslint, zero warnings tolerated
pnpm check-types  # next typegen && tsc --noEmit
```

Open http://localhost:3000.

## Where the specs live

Read these before changing anything user-facing. They are the contract, in priority order:

| Document | Covers |
|---|---|
| `../../docs/website-plan/mcbuse-website-handover.md` | **The implementation contract.** Locked lexicon, routes, design tokens as code, component contracts, interaction states, form schemas, accessibility, SEO, acceptance criteria. |
| `../../docs/website-plan/mcbuse-stitch-prompts.md` | Visual spec and per-screen design prompts, including all body copy. |
| `./brand.md` | Brand palette, typography, radius, motion, visual rules. |
| `./web.md` | Site structure — what pages exist and what goes on them. |

The eight PDFs in `docs/website-plan/` are the original source material. They are superseded — you do not need to read them.

## Conventions

- **Never inline a hex value.** All colours are semantic tokens declared in `@theme` in `app/globals.css`. See `brand.md`.
- **IBM Plex Mono for every figure** — amounts, counts, timestamps, IDs, field names. This is the strongest brand signal on the site.
- **Never `transition-all`.** Name the properties.
- **`text-subtle` is never body text** — it measures 3.29:1 and fails WCAG AA. Body copy is `text-muted`.
- **Primary buttons are `text-on-accent` on `bg-accent`**, not white on blue. White on blue cannot reach AA.
- Use `focus-visible`, never `focus`, for focus rings. Never remove them.
- Minimum 44px touch targets — `min-h-11` on links, `min-h-12` on buttons.
- Reuse `components/landing/Section.tsx` and its exported class constants (`primaryButtonClass`, `secondaryButtonClass`, `tertiaryLinkClass`, `linkFocusClass`) rather than restyling from scratch.
- Route CTAs through `linkOrRequestAccess()` in `components/landing/constants.ts` — most external URLs are not configured yet, and that helper degrades them to a pre-filled mailto instead of a dead link.

## Structure

```
app/
  globals.css          Tailwind v4 @theme token block
  layout.tsx           Fonts, header, footer, metadata
  page.tsx             /
components/
  landing/             Shared sections and primitives
public/                Static assets
```

## Deployment

Not yet configured. Vercel is the expected target.
