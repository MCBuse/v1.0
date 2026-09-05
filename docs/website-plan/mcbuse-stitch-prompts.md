# MCBuse Website — Google Stitch Prompt Pack

**Version 1.1 · 2026-09-04 · Dark theme**

> **v1.1 — updated to match the built site.** Radius is now sharp everywhere, primary buttons are white with black text, buttons are uppercase mono, and a masked grid backdrop was added. The hero's right column is a payment-to-record panel. See the *never generate* list — it has grown, based on what a Stitch pass actually produced.

## How to use this file

Google Stitch generates one screen at a time and loses context between generations. So:

1. Copy **§1 Design System Preamble** — paste it at the top of *every* generation.
2. Append **one screen block** from §2–§9.
3. Generate. Then regenerate the same block with `Mobile` selected, adding the matching entry from **§11 Mobile collapse rules**.
4. §10 is a reference sheet — paste the relevant rows when a component comes out wrong.

Everything inside a fenced block is prompt text. Everything outside it is instruction for you, not for Stitch.

**What this supersedes:** the 8 PDFs in this folder (structure and copy), `apps/web/brand.md` before v1.1 (light palette, "avoid dark-only Web3 styling"), and `apps/web/web.md` §6 (visual style guide). Where those disagree with this file, this file wins. Engineering detail — states, a11y, forms, SEO, file paths — lives in `mcbuse-website-handover.md`.

---

## §1 Design System Preamble

```
Design a dark-theme marketing website for MCBuse, a European fintech data-infrastructure
company. It turns everyday low-ticket merchant payments into structured financial records.
Audiences: micro-merchants (cafés, kiosks, bakeries, food trucks in Berlin and Munich),
and banks, fintechs and payment service providers.

AESTHETIC DIRECTION: stark minimal. Near-black canvas, a single blue accent, generous
whitespace, tight technical typography. It should feel like precision infrastructure —
closer to Vercel or Linear than to a consumer app, and nothing like a cryptocurrency site.

COLOR — use these exact values:
  Page background      #0A0B0D
  Card / panel         #14161A
  Raised panel         #1C1C1E
  Signature dark band  #000000
  Primary text         #FFFFFF
  Body text            #8E8E93
  Metadata only        #636366
  Hairline borders     rgba(255,255,255,0.08)
  Emphasis borders     rgba(255,255,255,0.16)
  Primary button       #FFFFFF fill with #000000 text
  Accent blue          #2E96FF   (links, icons, active states, data highlights)
  Accent hover         #57ACFF
  Accent tint          rgba(46,150,255,0.12)   (chips, quiet bands)
  Text on accent       #06070A
  Success green        #22C55E   (verified, ready)
  Warning amber        #FF9500   (sandbox, pending)
  Error red            #FF3B30   (failed, missing)

Blue is the ONLY accent and it always carries meaning — links, primary action, active
state, or a data highlight. Never decorative. Green, amber and red appear only as status.

TYPOGRAPHY: IBM Plex Sans for all text. IBM Plex Mono for every number, currency amount,
percentage, timestamp, ID and code label — this is the signature of the brand.
  Display  56px / 700 / letter-spacing -0.03em
  H1       40px / 700 / -0.02em
  H2       30px / 600 / -0.02em
  H3       20px / 600
  Body     16px / 400 / line-height 1.6 / color #8E8E93
  Small    14px / 400
  Label    12px / 500 / uppercase / letter-spacing 0.08em / color #636366
Three text weights only: 400, 500, 600 — plus 700 for display and H1.

BORDER RADIUS: zero. Everything is square — buttons, cards, chips, inputs, panels.
Sharp corners are what make this read as engineered infrastructure rather than a
rounded consumer app. The only round thing on the site is a small status dot.

BUTTONS — square, 48px tall, UPPERCASE MONO with wide letter-spacing (0.08em):
  Primary    — solid #FFFFFF fill with #000000 text
  Secondary  — transparent with a 1px rgba(255,255,255,0.16) border and #FFFFFF text
  Tertiary   — plain #2E96FF text with a chevron, no fill, no border
White means act; blue means navigate or inform. Blue NEVER fills a button.
There is exactly one primary button per screen section.

DEPTH: create elevation with background shade, not shadow. Cards sit on #14161A against a
#0A0B0D page. No element carries a drop shadow.

BACKDROP: behind the hero, a 48px grid of white hairlines at 3.5% opacity, radially masked
so it fades out before reaching the text, plus one accent-blue radial at 6% or less. This is
texture, not a gradient fill — it is the only atmospheric treatment on the site.

LAYOUT: content column max 1152px, centred, with 20px side padding on mobile and 32px on
desktop. Vertical rhythm between sections is large — 96px on mobile, 128px on desktop.
Full-bleed background bands are encouraged; do not wrap whole sections in floating cards.
Break symmetry: prefer unequal splits (7/5, 8/4) over centred 50/50 and over three
identical columns.

NEVER INCLUDE — this list is strict:
  - coins, tokens, chains, blockchain cubes, wallets, hexagon grids, node networks
  - any gradient, especially violet-to-blue; no gradient text
  - glassmorphism, frosted panels, glowing orbs, decorative blobs, particle fields
  - stock photography of cafés, shopkeepers, handshakes, bank interiors, or city skylines
  - a row of three identical cards each with a circular icon, a heading and a paragraph.
    Rows of parallel panels are allowed ONLY for genuinely parallel secondary content, and
    then they must be differentiated — a mono numeral or a mono figure instead of an icon,
    or a bordered list instead of cards. Never use them to carry a primary value proposition.
  - rounded corners of any size — this site is square throughout
  - emoji, badges reading "AI-powered", or vague headlines like "Build the future"
  - isometric or 3D floating tile clusters, "core" nodes, or anything resembling a
    network diagram — this is the single worst failure mode for this brand
  - more than one accent colour. Rainbow icon sets (cyan/rose/amber/emerald/purple/pink)
    are forbidden; blue is the only accent
  - INVENTED METRICS OF ANY KIND. No latency figures, uptime, throughput, "LIVE" or
    "REAL-TIME" badges, version numbers, benchmark labels, user counts, or fake video
    player chrome with timestamps. The company is in MVP and pilot preparation; any such
    claim contradicts the site's own safety line and is a compliance problem, not a
    style one
  - product capabilities not present in the copy provided (e.g. "SEPA INSTANT",
    "instant settlement"). Use the given copy verbatim; invent nothing
  - third-party logos of any kind (Solana, Stripe, Colosseum, universities, banks)

INSTEAD OF DECORATION, show the product: merchant dashboard panels, transaction rows with
mono-spaced amounts and timestamps, QR and NFC payment flows, status chips, data-field
tables, and simple flow diagrams built from bordered boxes and thin arrows.

BRAND MARK: there is no logo yet. Render the wordmark as "MCBuse" in IBM Plex Sans 600,
preceded by a 32px rounded-square monogram tile — #2E96FF fill, #06070A letter "M".

MOTION: understated. Entrances 300ms, exits 200ms, custom ease-out. No bounce, no parallax,
no autoplaying video, no scroll-jacking.
```

---

## §2 Screen — Homepage (`/`)

```
SCREEN: MCBuse homepage. Long scrolling dark page, eight bands.

STICKY HEADER (64px, background #0A0B0D at 95% opacity with a blur, 1px bottom hairline):
Monogram tile + "MCBuse" wordmark on the left. Centre-right nav in 14px #8E8E93:
Product · Merchants · Partners · Roadmap · Company. Far right: one primary square button in uppercase mono
"Join the Pilot". Nothing else in the header.

BAND 1 — HERO. Asymmetric two-column, 7/5 split, left-aligned, NOT centred.
Left column:
  Small uppercase label in #636366: "MVP · PILOT PREPARATION · BERLIN & MUNICH"
  Display headline, white, tight tracking, three lines:
      "From low-ticket payments
       to merchant financial
       visibility"
  Body paragraph in #8E8E93, max 52 characters per line:
      "Micro-merchants process high-frequency, low-ticket transactions that stay invisible
       to the formal financial system. MCBuse turns that activity into structured financial
       data — analytics merchants can use, and evidence institutions can verify."
  Button row: primary "Join the Pilot", secondary "Watch the demo".
  Below the buttons, 14px #636366 with a small info icon:
      "Currently in MVP and pilot preparation. Regulated payment and financial services are
       handled by licensed partners."
Right column — one square bordered panel, #14161A, split into two zones by a hairline. It
shows a payment becoming a record, which is the entire value proposition in one image.
  Upper zone — the capture moment: a small mono label "PAYMENT REQUEST" with an "EURC" chip
  on the right; a large mono amount "3.40"; the line "Kiosk checkout · Berlin"; then a crisp
  black-on-white QR matrix beside an NFC icon labelled "NFC READY".
  A small square badge containing a downward arrow straddles the divider.
  Lower zone — the same event as structured data on the darker #0A0B0D ground: a mono label
  "STRUCTURED RECORD" with a green "CAPTURED" chip, then mono key/value rows —
  Amount 3.40 EURC · Captured 14:22:07 CET · Method NFC · Merchant MRC-4821 · Ticket size
  Low-ticket.
Caption beneath, small mono grey: "Sample data. Not a live merchant account."
No shadow. No coins, no chains, no floating tiles, no glow on the panel itself.

BAND 1b — STEP STRIP. Directly under the hero, a single bordered row (#14161A) divided into
three equal cells by hairlines. Each cell: a small mono accent numeral (01/02/03), a bold
title, and a mono uppercase sub-line.
  01  "Accept micro-payments"  —  "QR AND NFC AT THE COUNTER"
  02  "Structure the record"   —  "AMOUNT, TIME, METHOD, STATUS"
  03  "Build visibility"       —  "HISTORY A LENDER CAN CHECK"
Stacks vertically below 768px.

BAND 2 — AUDIENCE SPLIT. Two wide cards side by side on #0A0B0D, square, #14161A fill,
hairline border. Each card: a small accent-blue line icon, an H3, one line of body copy, and
a tertiary text link with a chevron.
  Card A — "I run a business"
      "Accept payments, see your daily activity, and build a record you can show a lender."
      link: "For merchants →"
  Card B — "I'm at a bank, fintech or PSP"
      "Structured merchant activity data and readiness indicators for low-ticket segments."
      link: "For partners →"
On hover the card border brightens to rgba(255,255,255,0.16) and the link turns #57ACFF.

BAND 3 — THE PROBLEM. Full-bleed #000000 band.
Left-aligned H2: "Micro-activity is real. The data is missing."
Directly under it, a large pull-quote in white 24px italic with a 2px #2E96FF left rule:
      "I run a real business, but I cannot prove it clearly."
Then THREE problems in an asymmetric stacked layout — NOT three equal cards. Render each as
a full-width row: a large mono numeral (01, 02, 03) in #636366 on the left, then a 40%-width
H3, then a 45%-width body paragraph, separated by hairline rules.
  01  "Payments that leave no usable record"
      "Cash and scattered digital wallets mean high-frequency sales create no consistent
       business history. Traditional card terminals are priced and built for larger tickets."
  02  "No visibility into your own business"
      "Without simple analytics a merchant cannot see daily totals, trading rhythm or
       basket-size patterns — and cannot tell whether a payout is expected, late or missing."
  03  "Invisible to the institutions that could help"
      "Screenshots and statements are hard to verify. Lenders cannot tell whether the
       information is complete, so every application starts again from zero."

BAND 4 — THE SOLUTION. Back to #0A0B0D.
H2: "Payment data becomes merchant intelligence"
Body: "MCBuse captures QR, NFC and stablecoin payment events and converts them into
structured merchant records. Those records power business analytics, credit-readiness
indicators, and preparation for review by banks and financial institutions."
Below, a horizontal flow diagram of four equal bordered boxes joined by thin 1px accent-blue
arrows. Each box: #14161A fill, square, hairline border, a small accent line icon, an
H3, and a 12px uppercase label underneath. Boxes read:
  "Payment"   label CAPTURE
  "Analytics" label UNDERSTAND
  "Readiness" label ASSESS
  "Matching"  label PREPARE
Each box is clickable and links to the matching module on the Product page.
Beneath the diagram, a closing pull-quote in white 20px with an accent left rule:
      "Here is the trusted financial record of my business, here is what it tells me about
       performance, and here is a profile you can independently check."

BAND 5 — VALUE SNAPSHOT. #0A0B0D with a hairline top border.
H2: "Built for micro-retail operational growth"
A 2×2 grid of four panels, #14161A, square. Each panel: a 12px uppercase accent label,
a large mono figure in white, an H3, and a body line.
  CAPTURE   "EUR 0.10–10.00"    "Payment Capture"        "Zero-friction QR and NFC event capture for micro-tickets."
  ANALYTICS "Daily & hourly"    "Business Analytics"     "Sales rhythm and real-time payout clarity."
  READINESS "Indicators"        "Credit-Readiness"       "Internal data consistency and early readiness signals — not a credit score."
  MATCHING  "Merchant-authorized" "Institutional Matching" "Structured business profiles prepared for partner review."
Tertiary link under the grid: "See the full product breakdown →"

BAND 6 — BOUNDARY / TRUST. Full-bleed #000000.
H2: "What MCBuse is, and what it isn't"
Two columns divided by a single vertical hairline. Each column has a 12px uppercase label and
a list of four rows; every row is a short line of white 16px text with a small leading icon —
accent-blue check icons on the left column, #636366 lock icons on the right.
  Left,  label "MCBUSE PROVIDES":
      "Merchant-facing software and payment-event capture"
      "Data structuring and merchant activity records"
      "Business analytics and readiness indicators"
      "Merchant-authorized, verifiable activity profiles"
  Right, label "LICENSED PARTNERS HANDLE":
      "Regulated payment execution and settlement"
      "Safeguarding, KYC, KYB and AML compliance"
      "Credit underwriting and final lending decisions"
      "Any regulated financial product or approval"
Tertiary link: "Read the frequently asked questions →"

BAND 7 — FINAL CTA. #14161A band, square, inset from the page edges, generous padding.
Centred here — this is the one place symmetry is allowed.
H2 white: "Help build financial visibility for micro-merchants"
Body #8E8E93, one line: "We are talking to merchants, banks, fintechs, payment service
providers and investors."
Button row: primary "Join the Pilot", secondary "Schedule a partner call".
Under it, two tertiary text links separated by a middot: "Watch the demo · Download the pitch deck".

FOOTER — #000000, hairline top border, four columns of 14px links with 12px uppercase
#636366 headings, then a divider, then fine print.
  COMPANY   Company · Team · Contact
  PRODUCT   Product & Systems · Sandbox Demo · Roadmap
  LEGAL     Privacy Policy · Terms of Use · Impressum
  CONNECT   LinkedIn · X
Fine print in #636366 12px, two lines:
  "MCBuse is a merchant-facing software and data layer. Regulated payment execution,
   settlement, safeguarding, KYC/KYB, AML checks, lending decisions and underwriting remain
   with licensed partners where required."
  "MCBuse is not a bank or a licensed payment institution."
```

---

## §3 Screen — Product & Systems (`/product`)

```
SCREEN: MCBuse product page. Same dark system, header and footer as the homepage.

BAND 1 — HERO. Left-aligned, single column, max 800px wide. No image.
Label: "PRODUCT & SYSTEMS"
H1: "The MCBuse data architecture"
Body: "Four software modules designed to bridge high-frequency micro-transactions and the
formal financial system — structured capture, merchant analytics, readiness indicators, and
preparation for institutional review."
Primary button: "Request sandbox access".

BAND 2 — THE FOUR MODULES. A 2×2 grid of large panels, #14161A, square, hairline
border, 32px padding. Each panel contains, in order: a large mono numeral in #2E96FF
("01"–"04"), an H3, a body paragraph, a 12px uppercase "FOCUS" label with one line of copy,
and at the bottom — separated by a hairline — a boundary note in #636366 13px with a small
lock icon.
  01 "Payment Capture"
     "A QR, NFC and stablecoin-compatible payment-event capture layer."
     FOCUS — "Zero-friction tracking for ticket sizes between EUR 0.10 and EUR 10.00."
     boundary — "Regulated payment execution and settlement remain with licensed partners where required."
  02 "Business Analytics"
     "Automated merchant dashboards tracking daily and hourly sales rhythm."
     FOCUS — "Turning unstructured payment events into a formal ledger history."
     boundary — "Dashboard visuals shown publicly use sample or anonymized data only."
  03 "Credit-Readiness"
     "Internal data-consistency analytics that surface early readiness indicators and name
      the gaps still blocking assessment."
     FOCUS — "Showing whether the available history is complete enough to be assessed."
     boundary — "MCBuse does not provide loans and does not produce a credit score. MVP outputs are readiness indicators only."
  04 "Institutional Matching"
     "Merchant-authorized activity profiles, prepared so a bank, fintech, PSP or lending
      partner can independently check that they are genuine and unchanged."
     FOCUS — "Preparation and portability, not placement."
     boundary — "Matching means preparation, not a guaranteed connection. Financial products and lending decisions remain with licensed partners."
On module 03, add a small square amber chip reading "NOT A CREDIT SCORE" beside the H3.

BAND 3 — WHY VERIFIABLE RECORDS. Full-bleed #000000. Two columns, 5/7 split.
Left: H2 "Simple on the front end. Verifiable underneath."
Right: body copy —
  "Merchants and customers use a familiar payment flow. Underneath, MCBuse records each
   payment event so the resulting history is provider-neutral and independently checkable.
   Stablecoin payments are the initial capture surface because they produce a clean,
   first-party record of a sale at the moment it happens."
  "A merchant can therefore share a profile a lender is able to verify, rather than a
   screenshot a lender has to trust."
Beneath the copy, a row of four small chips with hairline borders and mono labels:
  "Verified event"  "Timestamp"  "Record integrity"  "Merchant consent"
Absolutely no chain, block, coin or network imagery in this band. If a visual is needed, show
a bordered data-field table with mono keys and values.

BAND 4 — HOW IT WORKS. #0A0B0D.
H2: "Seven steps from a sale to a lender-ready profile"
A vertical timeline down the left edge: a 1px #2E96FF rule with seven small filled dots.
Each step is a row: a mono step number in #636366, an H3, and one line of body copy.
  01 Onboarding      — "A basic merchant profile plus explicit data-consent capture."
  02 Event capture   — "A QR, NFC or stablecoin payment event is captured by MCBuse or a partner flow."
  03 Structuring     — "Each payment event becomes a structured transaction record."
  04 Analytics       — "Transaction records become merchant-facing business insights."
  05 Payout visibility — "Expected, completed and delayed payouts are tracked where partner data is available."
  06 Credit readiness  — "Internal consistency checks generate early readiness indicators and name the gaps."
  07 Matching prep     — "The merchant authorizes a profile that an institution can review and verify."
Below: primary button "View the sandbox demo".

FOOTER — identical to the homepage footer.
```

---

## §4 Screen — For Merchants (`/merchants`)

```
SCREEN: MCBuse merchants page. Same dark system, header and footer as the homepage.

BAND 1 — HERO. Asymmetric 6/6 split.
Left: label "FOR MICRO-MERCHANTS"
  H1: "Accept payments. Understand activity. Build financial visibility."
  Body: "Built for kiosks, cafés, bakeries and food trucks. Daily sales tracking, payout
   clarity, and preparation for future financial services."
  Primary button "Join the Pilot", secondary "Check your eligibility".
Right: a merchant dashboard mockup — a #14161A panel, square, hairline border, showing
a realistic dark analytics UI. Contents: a top row of three stat tiles with 12px uppercase
labels and large mono figures ("TODAY'S SALES · EUR 412.80", "TRANSACTIONS · 137",
"AVG TICKET · EUR 3.01"); below them a simple bar chart of hourly sales with accent-blue bars
on a hairline grid; below that two rows reading "Expected payout · EUR 389.20 · Fri" with an
amber "Pending" chip, and "Readiness · Building history" with a green progress bar at about
60%. A small #636366 caption under the panel: "Sample data. Not a live merchant account."

BAND 2 — WHAT YOU'LL SEE. #0A0B0D.
H2: "What you'll see"
A two-column checklist — not cards. Nine rows, each a small accent-blue check icon plus one
line of white 16px text, split across two columns with hairline row separators:
  "QR and NFC payment-event capture"
  "Full transaction history"
  "Daily sales visibility"
  "Hourly sales rhythm"
  "Average transaction size"
  "Payout visibility where available"
  "Delayed and missing payout alerts"
  "A business activity profile"
  "Credit-readiness indicators"

BAND 3 — ELIGIBILITY CHECK. Full-bleed #000000. Anchor target, centred column max 720px.
Label "ELIGIBILITY"
H2: "Is the pilot a fit for your business?"
Body: "Three questions. Nothing is stored unless you choose to apply."
An interactive card, #14161A, square, 32px padding, holding three questions. Each
question is a line of white 16px text with a pair of square segmented-control buttons to the
right; the selected button is filled #FFFFFF with #000000 text, the unselected one is
transparent with a hairline border.
  "Is your average sale between EUR 0.10 and EUR 10.00?"    [Yes] [No]
  "Do you take many small payments on a typical day?"       [Yes] [No]
  "Do you have an NFC-capable smartphone or terminal?"      [Yes] [No]
  Below: a location select, square, dark fill — "Where are you based?" with options
  Berlin, Munich, Elsewhere in Germany, Outside Germany.
  Then a full-width primary button "Check eligibility".
Show the result state directly beneath the button, inside the same card, as a bordered inset
panel: a green check icon, white H3 "You look like a good fit for the Berlin pilot.", a body
line "The pilot focuses on high-frequency, low-ticket merchants in Berlin and Munich.", and a
primary button "Apply to the pilot".

BAND 4 — WHERE WE'RE STARTING. #0A0B0D. Two columns, 5/7.
Left: H2 "Starting with Berlin and Munich"
Right: body — "Our first pilot focuses on high-frequency, low-ticket businesses in two core
urban ecosystems: cafés, kiosks, bakeries, takeaway shops, food trucks, bars and small
retailers." Then a row of chips with hairline borders: "Berlin", "Munich", "Cafés",
"Kiosks", "Bakeries", "Food trucks", "Small retail".
No map illustration, no photography.

BAND 5 — FAQ. #0A0B0D with a hairline top border. Single column, max 800px.
H2: "Questions merchants ask"
Five accordion rows. Each closed row: white 16px question, a #636366 plus icon on the right,
hairline separator. Show the first row expanded, its answer in #8E8E93 body text.
  "Does MCBuse lend me money?" — expanded — "No. MCBuse does not provide loans and does not
   make credit decisions. It helps you build evidence of your business performance and shows
   whether that history is complete enough to be assessed. Any lending decision stays with a
   licensed partner."
  "Does MCBuse hold my money?"
  "Who can see my data?"
  "What does it cost to join the pilot?"
  "Do I need new hardware?"

BAND 6 — CTA STRIP. #14161A inset panel, square. H2 "Join the merchant pilot", one body
line, primary button "Join the Pilot".

FOOTER — identical to the homepage footer, but replace the fine print with:
  "MCBuse does not provide loans and does not make final credit decisions. The MVP generates
   early credit-readiness indicators to help merchants become more understandable to
   financial institutions in the future."
```

---

## §5 Screen — For Partners (`/partners`)

```
SCREEN: MCBuse partners page. Same dark system, header and footer as the homepage.
This page must read as the most sober, institutional page on the site.

BAND 1 — HERO. Left-aligned, single column, max 860px. No product mockup.
Label: "FOR BANKS, FINTECHS AND PSPs"
H1: "Structured merchant activity data for underserved low-ticket segments."
Body: "MCBuse is a software and data infrastructure layer. It provides structured merchant
activity data and credit-readiness indicators that support — but do not replace — your
institution's own underwriting process."
Primary button "Schedule a partner call", secondary "Review the data fields".

BAND 2 — ACCOUNTABILITY SPLIT. Full-bleed #000000.
H2: "Where the boundary sits"
Two panels side by side, #14161A, square, divided visually by their own borders. Each
has a 12px uppercase label, an H3, and a list of three rows with leading icons.
  Panel A — label "INFRASTRUCTURE LAYER", H3 "MCBuse accountabilities", accent-blue icons:
      "Merchant-facing software deployment"
      "Data capture and structuring pipelines"
      "Pre-qualified visibility profiles"
  Panel B — label "REGULATED LAYER", H3 "Partner accountabilities", #636366 icons:
      "Regulated payment execution and settlement mechanics"
      "Safeguarding, KYC/KYB and AML compliance ownership"
      "Credit underwriting and final lending distribution decisions"

BAND 3 — DATA FIELDS. #0A0B0D. Anchor target.
H2: "What the profile contains"
Body: "Fields are classified under our internal data-classification framework. Only
classification levels 1 and 2 are ever surfaced to a partner. Levels 3 to 5 remain
internal-only."
A collapsible bordered panel titled "Level 1–2 partner-visible fields", shown expanded, laid
out as a data table with three columns — FIELD (mono), TYPE (mono, #636366), LEVEL (a small
chip). Hairline row separators, no zebra striping. Eight example rows:
  merchant_id            string    L1
  city                   string    L1
  merchant_category      enum      L1
  active_days_count      integer   L2
  transaction_count_30d  integer   L2
  avg_ticket_value       decimal   L2
  payout_exception_rate  decimal   L2
  readiness_status        enum      L2
Below the table, a #636366 13px note with a lock icon: "Individual merchant records are
released only with that merchant's explicit authorization. MCBuse is a trusted data partner,
not a data broker."

BAND 4 — DATA GOVERNANCE. Full-bleed #000000.
H2: "How the data is governed"
A 2x2 grid of panels, #14161A, square, 32px padding. Each panel leads with a mono
numeral in #636366 (01-04), then an H3, then two lines of body copy. No icons in this band —
the numerals carry it, and it must not read as a row of feature cards.
  "Consent first"      — "Nothing is captured without an explicit merchant consent record, and consent is revocable."
  "Merchant-controlled" — "The merchant authorizes each share. Profiles are portable and provider-neutral."
  "Independently verifiable" — "A partner can confirm a profile is genuine and unchanged without trusting a screenshot."
  "Minimized by design" — "Only the fields a decision needs leave the platform. Everything else stays internal."

BAND 5 — FAQ. #0A0B0D, single column max 800px.
H2: "Questions partners ask"
Four accordion rows, first expanded:
  "Is MCBuse a regulated entity?" — expanded — "No. MCBuse does not replace regulated
   financial infrastructure. Regulated payment execution, settlement, safeguarding, KYC/KYB
   and AML remain with licensed partners, and all underwriting and lending decisions remain
   with you."
  "Does MCBuse score merchants?"
  "How is merchant data shared with us?"
  "What integration options are planned?"

BAND 6 — CTA STRIP. #14161A inset panel, square. H2 "Talk to us about a pilot", one body
line, primary button "Schedule a partner call".

FOOTER — identical to the homepage footer, with the fine print replaced by:
  "MCBuse does not replace regulated financial infrastructure. Financial products, approvals,
   underwriting and regulated services remain with licensed partners."
```

---

## §6 Screen — Roadmap (`/roadmap`)

```
SCREEN: MCBuse roadmap page. Same dark system, header and footer as the homepage.

BAND 1 — HERO. Left-aligned, max 800px.
Label "ROADMAP"
H1: "What we're building, in order"
Body: "Four phases from MVP foundation to partner-facing access. Timelines are indicative and
will move with pilot results and partner discussions."

BAND 2 — PHASES. #0A0B0D. A vertical timeline: a 1px vertical rule on the left in
rgba(255,255,255,0.16), turning #2E96FF for the portion covering phases 1 and 2. Four large
milestone rows hang off it. Each row: a node on the rule, a status chip, a mono phase number,
an H3, and two bullet lines in body copy.
  Phase 01 — chip "NOW" in white fill with #000000 text — "MVP foundation"
      "Merchant onboarding and stablecoin-compatible payment-event capture active."
      "First merchant analytics dashboards delivered, with daily and hourly tracking."
  Phase 02 — chip "NOW" in accent-blue fill — "Pilot readiness"
      "Merchant pilot recruitment and payment-event quality testing."
      "Payout visibility where partner data is available, plus exception detection."
      "Pilot KPI tracking with consent and data-governance workflows."
  Phase 03 — chip "NEXT" in amber tint with #FF9500 text and border — "Credit-readiness infrastructure"
      "Internal data-consistency algorithms live."
      "Merchant activity profiles and credit-readiness indicators generated."
  Phase 04 — chip "LATER" with a hairline border and #636366 text — "Matching preparation"
      "Matching-readiness profiles and partner-fit categories, semi-automated review."
      "Secure partner dashboards and API-based profile access in later stages."
The two "NOW" nodes are filled; "NEXT" is a ring; "LATER" is a hollow outline in #636366.
Under the timeline: secondary button "Download the pitch deck", tertiary link "View pilot KPIs →".

BAND 3 — BUSINESS MODEL. Full-bleed #000000.
H2: "How the business works"
Three panels in a row, #14161A, square, each with a 12px uppercase mono label, an H3 and
one body line.
  "PRIMARY"  — "B2B licensing" — "Licensing to banks, fintechs and payment service providers."
  "PLANNED"  — "Partner access" — "API and dashboard access to authorized merchant profiles."
  "LATER"    — "Merchant analytics" — "Subscription analytics for merchants in later stages."
Below, a single line in #636366 13px with a lock icon: "No lending, credit-scoring or
regulated financial-product revenue is claimed at MVP stage."

BAND 4 — VISION. #0A0B0D, single centred column max 860px, very generous vertical padding.
Label "WHERE THIS GOES"
A large 32px white statement, tight tracking, no quote marks:
  "Over time, MCBuse will become the trusted distribution and payments infrastructure through
   which approved stablecoin issuers can reach merchants and consumers — while the resulting
   data network supports better financial decisions."
Beneath it, one line in #636366: "A direction, not a commitment. Everything above is subject
to pilot results, partner discussions and applicable regulation."
No illustration in this band. The typography is the visual.

BAND 5 — CTA STRIP. #14161A inset panel, square. H2 "Follow the build", one body line,
primary button "Join the waitlist".

FOOTER — identical to the homepage footer, with the fine print replaced by:
  "The roadmap reflects current MVP scope and future product direction. Timelines are
   indicative and subject to change based on pilot results and partner discussions."
```

---

## §7 Screen — Sandbox & Demo (`/demo`)

```
SCREEN: MCBuse sandbox and demo page. Same dark system, header and footer as the homepage.

BAND 1 — HERO. Left-aligned, max 860px.
Label "SANDBOX"
H1: "Explore the MCBuse sandbox"
Body: "Test data-capture parameters and dashboard alerts against simulated transaction
feeds. A non-regulated, purely technical simulation environment."
An amber status chip beside the H1 — amber tint fill, #FF9500 text and border, small dot —
reading "SANDBOX · SIMULATED DATA".

BAND 2 — VIDEO. #0A0B0D. One large 16:9 player card, #14161A, square, hairline border,
occupying the full content width. Inside: a dark poster frame showing the merchant dashboard,
a square accent-blue-outlined play button, and a mono duration chip "3:00" in the
bottom-right corner. Do not autoplay. Under the player, a row: an H3 "Product walkthrough"
on the left, and on the right a tertiary link "Watch the pitch video →".

BAND 3 — WHAT THE SANDBOX SHOWS. Full-bleed #000000.
H2: "What you can try"
Four rows in a bordered list — not cards. Each row: a mono numeral in #636366, an H3, one line
of body copy, hairline separator.
  01 "Simulated payment capture" — "Push synthetic QR and NFC payment events through the capture layer."
  02 "Dashboard behaviour"       — "Watch daily and hourly aggregates rebuild as events arrive."
  03 "Payout exceptions"         — "Trigger delayed and missing payout states and see how they surface."
  04 "Readiness indicators"      — "See how data-consistency checks change a readiness status."

BAND 4 — ACCESS. #0A0B0D. Two columns, 7/5.
Left: H2 "Request sandbox access", body "Tell us who you are and we'll send credentials and a
guided walkthrough." Then a compact form on a #14161A panel, square: labelled square inputs with hairline borders and #636366 placeholders — Name, Work email, Organisation,
and a select "I am a: Merchant / Bank / Fintech / PSP / Investor / Developer / Other". A
consent checkbox with a small accent-blue check and 13px #8E8E93 label: "I agree to MCBuse
contacting me about sandbox access." Full-width primary button "Request access".
Right: a #14161A panel titled "Prototype build" with a 12px uppercase amber label
"ANDROID · PROTOTYPE", body copy "A test APK is available to sandbox participants on request.
It is a prototype build, not a production release.", and a secondary button
"Request the test build". Beneath it, in #636366 13px: "Request the build rather than
downloading it directly, so we can share the current version and known limitations."

BAND 5 — DISCLAIMER. A full-width inset panel, #14161A, square, 1px amber border at 30%
opacity, an amber warning icon, and white 16px text:
  "The sandbox demo is for testing, validation and product demonstration. It is not a full
   production payment or lending product, and some features are simulated."

FOOTER — identical to the homepage footer.
```

---

## §8 Screen — Contact (`/contact`)

```
SCREEN: MCBuse contact page. Same dark system, header and footer as the homepage.

BAND 1 — HERO. Centred, max 720px — one of the few centred layouts on the site.
Label "CONTACT"
H1: "Let's talk"
Body: "Choose what fits you and we'll route it to the right person."

BAND 2 — ROUTED FORM. #0A0B0D. Single centred column, max 720px.
At the top, a segmented control: one row of square buttons with a hairline border holding
three equal segments — "Merchant pilot", "Partner enquiry", "General waitlist". The active
segment is a filled #FFFFFF button with #000000 text; the others are transparent with #8E8E93
text. "Merchant pilot" is active.
Below it, a single form panel — #14161A, square, 32px padding — whose fields correspond
to the active segment. Show the MERCHANT PILOT field set:
  Your name                              (text input)
  Business name                          (text input)
  Target city                            (select: Berlin / Munich / Elsewhere)
  Contact email                          (email input)
  Contact phone                          (text input, marked "Optional" in #636366)
  Interested in QR or NFC payments?      (two square radio buttons: Yes / No)
  Anything else we should know?          (textarea, three lines)
  [ ] consent checkbox — "I consent to MCBuse processing this information for pilot
      evaluation. I can withdraw consent at any time."
  Full-width primary button "Submit pilot application"
Every input: 48px tall, square, #0A0B0D fill, 1px rgba(255,255,255,0.16) border, white
16px text, #636366 placeholder. Labels sit above their input in 14px #FFFFFF, with required
fields carrying a small accent-blue asterisk. On focus, the border turns #2E96FF and gains a
2px accent ring offset from the field.
Under the button, in #636366 13px: "We reply within two working days. Or email
hello@mcbuse.com directly."

BAND 3 — OTHER WAYS. Full-bleed #000000.
Three rows in a bordered list, not cards — hairline separators, 24px vertical padding, full
content width. Each row: an H3 on the left, one line of body copy in the middle, and a
tertiary link on the right, vertically centred.
  "Email us"        — "hello@mcbuse.com" (rendered in IBM Plex Mono) — link "Open email →"
  "Try the sandbox" — "Simulated transaction feeds and dashboard alerts." — link "Go to the sandbox →"
  "Read the deck"   — "The current investor and partner overview." — link "Download the pitch deck →"

FOOTER — identical to the homepage footer.
```

---

## §9 Screen — Company (`/company`)

```
SCREEN: MCBuse company page. Same dark system, header and footer as the homepage.

BAND 1 — MISSION. Left-aligned, max 900px, generous vertical padding.
Label "COMPANY"
H1: "Meet the team behind MCBuse"
Body, two paragraphs in #8E8E93:
  "MCBuse is built by a cross-functional team combining finance, IT, software engineering,
   marketing and growth."
  "We are building MCBuse to help micro-merchants turn everyday low-ticket activity into
   structured financial visibility — so a merchant can show what their business actually
   does, and an institution can verify it."

BAND 2 — TEAM. #0A0B0D.
H2: "The team"
Three cards in a row, #14161A, square, hairline border, 32px padding, left-aligned. Each
card, top to bottom: a 64px circular avatar rendered as a monogram — accent-tint fill,
#2E96FF initials in IBM Plex Sans 600 — then a white H3 name, a 12px uppercase accent-blue
role label, a #8E8E93 line for education, a #636366 line for experience, and at the bottom a
small LinkedIn icon link in #636366 that turns #2E96FF on hover.
  "Asim Emre Aci"           role "TEAM LEADER"       "MSc — University of Europe for Applied Sciences"  "Finance and IT"
  "Frederick Obeng Nyarko"  role "ENGINEERING LEAD"  "MSc — KNUST"                                      "Software engineering"
  "Berk Ozkan"              role "MARKETING LEAD"    "BA English Language Teaching, MSc Data Science — University of Europe for Applied Sciences"  "EdTech, digital pipelines and growth"
Use monogram avatars, not photographs, and not AI-generated portraits.

BAND 3 — HOW WE WORK. Full-bleed #000000. Two columns, 5/7.
Left: H2 "How we talk about what we're building"
Right: three rows, each a white 16px line with an accent-blue check icon and a #8E8E93
sub-line:
  "We say what stage we're at."      — "MVP and pilot preparation. Not a live production payment network."
  "We name the boundary."            — "Regulated execution, compliance and lending decisions sit with licensed partners."
  "We don't claim decisions we don't make." — "MCBuse shows whether a history is ready to be assessed. It never approves anyone."

BAND 4 — CTA STRIP. #14161A inset panel, square, centred. H2 "Work with us", one body
line "We're talking to merchants, partners and investors.", button row: primary
"Join the Pilot", secondary "Schedule a partner call".

FOOTER — identical to the homepage footer.
```

---

## §10 Component appearance sheet

Paste the relevant rows when Stitch gets a component wrong.

| Component | Appearance |
|---|---|
| **Header** | 64px tall, `#0A0B0D` at 95% opacity with backdrop blur, 1px bottom hairline. Monogram + wordmark left, 14px `#8E8E93` nav centre-right, one primary square button right. Active nav item is `#FFFFFF` with a 2px `#2E96FF` underline. |
| **Primary button** | Square, 48px tall, 32px horizontal padding, `#FFFFFF` fill, `#000000` text, 13px/700 **uppercase mono**, 0.08em tracking. Hover `#EBEBEB`. Blue never fills a button. |
| **Secondary button** | Square, 48px, transparent, 1px `rgba(255,255,255,0.16)` border, `#FFFFFF` uppercase mono text. Hover: border `#FFFFFF`, 6% white wash. |
| **Tertiary link** | `#2E96FF` 15px/500, no underline at rest, trailing chevron. Hover `#57ACFF` with the chevron shifted 2px right. |
| **Card — default** | `#14161A` fill, **square**, 1px `rgba(255,255,255,0.08)` border, 24–32px padding, no shadow. Hover: border to `rgba(255,255,255,0.16)`. |
| **Grid backdrop** | 48px grid of white hairlines at 3.5%, radially masked to fade before the content. Decorative, behind the hero only. |
| **Card — inset band** | `#14161A`, square, inset from page gutters, used for CTA strips. |
| **Card — ink band** | Full-bleed `#000000`, hairline top and bottom borders. |
| **Input / textarea** | 48px tall (textarea auto), square, `#0A0B0D` fill, 1px `rgba(255,255,255,0.16)` border, white 16px text, `#636366` placeholder. Focus: `#2E96FF` border plus a 2px accent ring offset 2px. Error: `#FF3B30` border with 13px `#FF3B30` message below. |
| **Select** | As input, with a `#636366` chevron on the right. |
| **Checkbox** | 20px, square, hairline border. Checked: `#2E96FF` fill with a `#06070A` check. 13px `#8E8E93` label to the right. |
| **Segmented control** | Three square buttons in a row, hairline borders. Active: `#FFFFFF` fill, `#000000` uppercase mono text. Inactive: transparent, `#8E8E93`. |
| **Status chip** | Square, 24px tall, 10px horizontal padding, 12px/500 mono text, tinted fill at 12% with matching border and text — green `#22C55E` verified/ready, amber `#FF9500` pending/sandbox, red `#FF3B30` failed/missing, `#636366` neutral. |
| **Accordion row** | Full-width, hairline bottom border, 20px vertical padding. Question white 16px/500, plus icon `#636366` rotating to a minus on open. Answer `#8E8E93` 16px, 300ms height ease-out. |
| **Data table** | Hairline row separators, no zebra striping, no outer border. 12px uppercase `#636366` headers. Mono for IDs, types, figures. Numbers right-aligned and tabular. |
| **Flow diagram** | Equal bordered boxes joined by 1px `#2E96FF` arrows with small solid arrowheads. Box: `#14161A`, square, hairline border. No curves, no glow, no animation on load. |
| **Vertical timeline** | 1px rule on the left; accent-blue over completed phases, `rgba(255,255,255,0.16)` after. Nodes: filled dot = now, ring = next, hollow `#636366` outline = later. |
| **Dashboard mockup** | Dark UI inside a card. Stat tiles: 12px uppercase label + large mono figure. Bar chart: accent-blue bars, hairline gridlines, no fill gradient, no drop shadow. Transaction rows: label, mono timestamp, mono amount, status chip. Always caption it "Sample data." |
| **Footer** | `#000000`, hairline top border, four link columns with 12px uppercase `#636366` headings, then a divider, then 12px `#636366` fine print. |

---

## §11 Mobile collapse rules

Append the matching line when generating the mobile variant. Single breakpoint at 1024px; section rhythm drops from 128px to 96px; side padding 20px.

| Section | Mobile behaviour |
|---|---|
| Header | Nav collapses to a hamburger opening a full-screen `#0A0B0D` sheet with 20px stacked links and the primary button pinned at the bottom. Wordmark and primary CTA stay visible in the bar. |
| Hero (all pages) | Single column, text first, visual below. Display drops to 36px, H1 to 30px. Buttons go full-width and stack with 12px between them. |
| Audience split | Two cards stack. |
| Problem rows | The numeral, heading and paragraph stack vertically inside each row; the mono numeral shrinks and sits above the heading. |
| Four-box flow diagram | Rotates to vertical; arrows point down. |
| 2×2 grids (value snapshot, product modules) | Single column. |
| Two-column checklists | Single column. |
| Accountability split (`/partners`) | Panels stack; the dividing hairline becomes a horizontal rule. |
| Data-fields table | Each row becomes a stacked block: field name in mono on top, then type and level chip on one line below. Never scroll a table horizontally. |
| Roadmap timeline | Rule moves to the far left at 12px inset; content indents 32px. |
| Contact segmented control | Stays horizontal but full-width with 13px labels; if the three labels won't fit, stack them as three full-width square buttons. |
| Team cards | Single column. |
| Footer | Link columns stack into four groups; fine print stays full-width. |
| Any inset CTA band | Padding tightens to 24px. |

---

## Asset gaps to resolve before final design

| Asset | Status | Interim in these prompts |
|---|---|---|
| MCBuse logo and wordmark | **Missing entirely** — no logo file exists in this repo | `#2E96FF` monogram tile + "MCBuse" set in IBM Plex Sans 600 |
| Team photos | Not available | Monogram avatars in accent tint |
| Product screenshots | Not available | Described dashboard and payment mockups |
| Merchant photography | Not available | Deliberately omitted — no stock imagery |
| Demo and pitch video | Not recorded | Poster frame with a play button |
| Pitch deck PDF | Not available | Button degrades to an email request |
| Test APK | Exists as a prototype | Request-only, not a direct download |
| Icons | Available — 553 single-colour 24×24 SVGs in `mcbuse/icons/`, plus `lucide-react` in the web app | Described as thin accent-blue line icons |
| Partner and ecosystem logos | Permission unconfirmed | Omitted entirely |
