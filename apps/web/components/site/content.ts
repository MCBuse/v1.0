/**
 * Site content.
 *
 * Copy lives here rather than inline in components so the locked lexicon
 * (docs/website-plan/mcbuse-website-handover.md §2) stays greppable in one
 * place. Before editing any string here, read §2 and §2.1.
 */

export const NAV_ITEMS = [
  { label: "Product", href: "/product" },
  { label: "Merchants", href: "/merchants" },
  { label: "Partners", href: "/partners" },
  { label: "Roadmap", href: "/roadmap" },
  { label: "Company", href: "/company" },
] as const;

export const FOOTER_COLUMNS = [
  {
    heading: "Company",
    links: [
      { label: "Company", href: "/company" },
      { label: "Roadmap", href: "/roadmap" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "Product",
    links: [
      { label: "Product & Systems", href: "/product" },
      { label: "For Merchants", href: "/merchants" },
      { label: "For Partners", href: "/partners" },
      { label: "Sandbox Demo", href: "/demo" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Use", href: "/terms" },
      { label: "Impressum", href: "/impressum" },
    ],
  },
] as const;

/* ──────────────────────────────────────────────────────────────
   Boundary statements — verbatim, per handover §2.
   B1/B3/B4/B5 are footer variants; B2 always follows.
   ────────────────────────────────────────────────────────────── */

export const BOUNDARY = {
  b1: "MCBuse is a merchant-facing software and data layer. Regulated payment execution, settlement, safeguarding, KYC/KYB, AML checks, lending decisions and underwriting remain with licensed partners where required.",
  b2: "MCBuse is not a bank or a licensed payment institution.",
  b3: "MCBuse does not provide loans and does not make final credit decisions. The MVP generates early credit-readiness indicators to help merchants become more understandable to financial institutions in the future.",
  b4: "MCBuse does not replace regulated financial infrastructure. Financial products, approvals, underwriting and regulated services remain with licensed partners.",
  b5: "The roadmap reflects current MVP scope and future product direction. Timelines are indicative and subject to change based on pilot results and partner discussions.",
  b6: "The sandbox demo is for testing, validation and product demonstration. It is not a full production payment or lending product, and some features are simulated.",
  b7: "Currently in MVP and pilot preparation. Regulated payment and financial services are handled by licensed partners.",
  b8: "MCBuse does not provide loans and does not produce a credit score. MVP outputs are readiness indicators only.",
  b9: "Sample data. Not a live merchant account.",
} as const;

/* ── Homepage ─────────────────────────────────────────────────── */

export const HERO = {
  eyebrow: "MVP · Pilot preparation · Berlin & Munich",
  headline: ["From low-ticket payments", "to merchant financial", "visibility"],
  body: "Micro-merchants process high-frequency, low-ticket transactions that stay invisible to the formal financial system. MCBuse turns that activity into structured financial data — analytics merchants can use, and evidence institutions can verify.",
} as const;

export const HERO_STEPS = [
  {
    title: "Accept micro-payments",
    detail: "QR and NFC at the counter",
  },
  {
    title: "Structure the record",
    detail: "Amount, time, method, status",
  },
  {
    title: "Build visibility",
    detail: "History a lender can check",
  },
] as const;

export const AUDIENCES = [
  {
    title: "I run a business",
    body: "Accept payments, see your daily activity, and build a record you can show a lender.",
    linkLabel: "For merchants",
    href: "/merchants",
  },
  {
    title: "I'm at a bank, fintech or PSP",
    body: "Structured merchant activity data and readiness indicators for low-ticket segments.",
    linkLabel: "For partners",
    href: "/partners",
  },
] as const;

export const PROBLEM_QUOTE = "I run a real business, but I cannot prove it clearly.";

export const PROBLEMS = [
  {
    n: "01",
    title: "Payments that leave no usable record",
    body: "Cash and scattered digital wallets mean high-frequency sales create no consistent business history. Traditional card terminals are priced and built for larger tickets.",
  },
  {
    n: "02",
    title: "No visibility into your own business",
    body: "Without simple analytics a merchant cannot see daily totals, trading rhythm or basket-size patterns — and cannot tell whether a payout is expected, late or missing.",
  },
  {
    n: "03",
    title: "Invisible to the institutions that could help",
    body: "Screenshots and statements are hard to verify. Lenders cannot tell whether the information is complete, so every application starts again from zero.",
  },
] as const;

export const SOLUTION_QUOTE =
  "Here is the trusted financial record of my business, here is what it tells me about performance, and here is a profile you can independently check.";

export const FLOW_STEPS = [
  { title: "Payment", label: "Capture", href: "/product#payment-capture" },
  { title: "Analytics", label: "Understand", href: "/product#business-analytics" },
  { title: "Readiness", label: "Assess", href: "/product#credit-readiness" },
  { title: "Matching", label: "Prepare", href: "/product#institutional-matching" },
] as const;

export const VALUE_SNAPSHOT = [
  {
    label: "Capture",
    figure: "EUR 0.10–10.00",
    title: "Payment Capture",
    body: "Zero-friction QR and NFC event capture for micro-tickets.",
  },
  {
    label: "Analytics",
    figure: "Daily & hourly",
    title: "Business Analytics",
    body: "Sales rhythm, and payout clarity where partner data is available.",
  },
  {
    label: "Readiness",
    figure: "Indicators",
    title: "Credit-Readiness",
    body: "Internal data consistency and early readiness signals — not a credit score.",
  },
  {
    label: "Matching",
    figure: "Merchant-authorized",
    title: "Institutional Matching",
    body: "Structured business profiles prepared for partner review.",
  },
] as const;

export const BOUNDARY_COLUMNS = {
  provides: [
    "Merchant-facing software and payment-event capture",
    "Data structuring and merchant activity records",
    "Business analytics and readiness indicators",
    "Merchant-authorized, verifiable activity profiles",
  ],
  partners: [
    "Regulated payment execution and settlement",
    "Safeguarding, KYC, KYB and AML compliance",
    "Credit underwriting and final lending decisions",
    "Any regulated financial product or approval",
  ],
} as const;

/* ── /product ─────────────────────────────────────────────────── */

export const MODULES = [
  {
    id: "payment-capture",
    n: "01",
    title: "Payment Capture",
    body: "A QR, NFC and stablecoin-compatible payment-event capture layer.",
    focus: "Zero-friction tracking for ticket sizes between EUR 0.10 and EUR 10.00.",
    boundary:
      "Regulated payment execution and settlement remain with licensed partners where required.",
  },
  {
    id: "business-analytics",
    n: "02",
    title: "Business Analytics",
    body: "Automated merchant dashboards tracking daily and hourly sales rhythm.",
    focus: "Turning unstructured payment events into a formal ledger history.",
    boundary: "Dashboard visuals shown publicly use sample or anonymized data only.",
  },
  {
    id: "credit-readiness",
    n: "03",
    title: "Credit-Readiness",
    body: "Internal data-consistency analytics that surface early readiness indicators and name the gaps still blocking assessment.",
    focus: "Showing whether the available history is complete enough to be assessed.",
    boundary: BOUNDARY.b8,
    warn: "Not a credit score",
  },
  {
    id: "institutional-matching",
    n: "04",
    title: "Institutional Matching",
    body: "Merchant-authorized activity profiles, prepared so a bank, fintech, PSP or lending partner can independently check that they are genuine and unchanged.",
    focus: "Preparation and portability, not placement.",
    boundary:
      "Matching means preparation, not a guaranteed connection. Financial products and lending decisions remain with licensed partners.",
  },
] as const;

export const PRODUCT_STEPS = [
  { n: "01", title: "Onboarding", body: "A basic merchant profile plus explicit data-consent capture." },
  {
    n: "02",
    title: "Event capture",
    body: "A QR, NFC or stablecoin payment event is captured by MCBuse or a partner flow.",
  },
  { n: "03", title: "Structuring", body: "Each payment event becomes a structured transaction record." },
  { n: "04", title: "Analytics", body: "Transaction records become merchant-facing business insights." },
  {
    n: "05",
    title: "Payout visibility",
    body: "Expected, completed and delayed payouts are tracked where partner data is available.",
  },
  {
    n: "06",
    title: "Credit readiness",
    body: "Internal consistency checks generate early readiness indicators and name the gaps.",
  },
  {
    n: "07",
    title: "Matching prep",
    body: "The merchant authorizes a profile that an institution can review and verify.",
  },
] as const;

export const VERIFIABLE_CHIPS = [
  "Verified event",
  "Timestamp",
  "Record integrity",
  "Merchant consent",
] as const;

/* ── /merchants ───────────────────────────────────────────────── */

export const MERCHANT_BENEFITS = [
  "QR and NFC payment-event capture",
  "Full transaction history",
  "Daily sales visibility",
  "Hourly sales rhythm",
  "Average transaction size",
  "Payout visibility where available",
  "Delayed and missing payout alerts",
  "A business activity profile",
  "Credit-readiness indicators",
] as const;

export const MARKET_CHIPS = [
  "Berlin",
  "Munich",
  "Cafés",
  "Kiosks",
  "Bakeries",
  "Food trucks",
  "Small retail",
] as const;

/* ── /partners ────────────────────────────────────────────────── */

export const ACCOUNTABILITIES = {
  infrastructure: [
    "Merchant-facing software deployment",
    "Data capture and structuring pipelines",
    "Pre-qualified visibility profiles",
  ],
  regulated: [
    "Regulated payment execution and settlement mechanics",
    "Safeguarding, KYC/KYB and AML compliance ownership",
    "Credit underwriting and final lending distribution decisions",
  ],
} as const;

/**
 * Illustrative of shape, not a committed API contract.
 * Confirm with the data owner before publishing.
 */
export const DATA_FIELDS = [
  { field: "merchant_id", type: "string", level: "L1" },
  { field: "city", type: "string", level: "L1" },
  { field: "merchant_category", type: "enum", level: "L1" },
  { field: "active_days_count", type: "integer", level: "L2" },
  { field: "transaction_count_30d", type: "integer", level: "L2" },
  { field: "avg_ticket_value", type: "decimal", level: "L2" },
  { field: "payout_exception_rate", type: "decimal", level: "L2" },
  { field: "readiness_status", type: "enum", level: "L2" },
] as const;

export const GOVERNANCE = [
  {
    n: "01",
    title: "Consent first",
    body: "Nothing is captured without an explicit merchant consent record, and consent is revocable.",
  },
  {
    n: "02",
    title: "Merchant-controlled",
    body: "The merchant authorizes each share. Profiles are portable and provider-neutral.",
  },
  {
    n: "03",
    title: "Independently verifiable",
    body: "A partner can confirm a profile is genuine and unchanged without trusting a screenshot.",
  },
  {
    n: "04",
    title: "Minimized by design",
    body: "Only the fields a decision needs leave the platform. Everything else stays internal.",
  },
] as const;

/* ──────────────────────────────────────────────────────────────
   FAQ

   ⚠ REVIEW REQUIRED BEFORE LAUNCH — Asim (product, business, risk).
   These answers make claims about money handling, data sharing and
   pilot cost. They are written against the §2 lexicon but have not
   been signed off. See handover §2 and §2.1.
   ────────────────────────────────────────────────────────────── */

export const MERCHANT_FAQ = [
  {
    q: "Does MCBuse lend me money?",
    a: "No. MCBuse does not provide loans and does not make credit decisions. It helps you build evidence of your business performance and shows whether that history is complete enough to be assessed. Any lending decision stays with a licensed partner.",
  },
  {
    q: "Does MCBuse hold my money?",
    a: "No. MCBuse is a software and data layer. Payments are executed and settled by licensed partners, and funds move through their regulated infrastructure rather than through MCBuse. What MCBuse records is that a payment happened — not the money itself.",
  },
  {
    q: "Who can see my data?",
    a: "You do, by default. Nothing about your business reaches a bank, fintech or lender unless you authorize that specific share, and you can withdraw consent at any time. When you do share, only the fields a decision actually needs are passed on.",
  },
  {
    q: "What does it cost to join the pilot?",
    a: "There is no charge to take part in the pilot. We are testing whether the analytics are genuinely useful and whether the readiness indicators make sense to you, so what we need from participating merchants is honest feedback.",
  },
  {
    q: "Do I need new hardware?",
    a: "In most cases, no. A reasonably recent smartphone or smart terminal with NFC is enough to take part. If your current setup will not work, we will tell you before you commit to anything.",
  },
] as const;

export const PARTNER_FAQ = [
  {
    q: "Is MCBuse a regulated entity?",
    a: "No. MCBuse does not replace regulated financial infrastructure. Regulated payment execution, settlement, safeguarding, KYC/KYB and AML remain with licensed partners, and all underwriting and lending decisions remain with you.",
  },
  {
    q: "Does MCBuse score merchants?",
    a: "No. MCBuse produces readiness indicators, which describe whether a merchant's activity history is complete and consistent enough to be assessed. That is a statement about the data, not about the merchant. The assessment, and the decision, remain yours.",
  },
  {
    q: "How is merchant data shared with us?",
    a: "Only with the merchant's explicit authorization, and only the classification level 1 and 2 fields listed above. A shared profile can be independently checked to confirm it is genuine and unchanged. MCBuse is a trusted data partner, not a data broker — you receive merchant-authorized evidence, not open access to raw records.",
  },
  {
    q: "What integration options are planned?",
    a: "Partner dashboards and API-based profile access are later-phase work and are not available today. Current partner conversations are about pilot collaboration and about defining which fields are genuinely useful inside your own underwriting process.",
  },
] as const;

/* ── /roadmap ─────────────────────────────────────────────────── */

export const PHASES = [
  {
    n: "01",
    status: "Now" as const,
    title: "MVP foundation",
    points: [
      "Merchant onboarding and stablecoin-compatible payment-event capture active.",
      "First merchant analytics dashboards delivered, with daily and hourly tracking.",
    ],
  },
  {
    n: "02",
    status: "Now" as const,
    title: "Pilot readiness",
    points: [
      "Merchant pilot recruitment and payment-event quality testing.",
      "Payout visibility where partner data is available, plus exception detection.",
      "Pilot KPI tracking with consent and data-governance workflows.",
    ],
  },
  {
    n: "03",
    status: "Next" as const,
    title: "Credit-readiness infrastructure",
    points: [
      "Internal data-consistency algorithms live.",
      "Merchant activity profiles and credit-readiness indicators generated.",
    ],
  },
  {
    n: "04",
    status: "Later" as const,
    title: "Matching preparation",
    points: [
      "Matching-readiness profiles and partner-fit categories, semi-automated review.",
      "Secure partner dashboards and API-based profile access in later stages.",
    ],
  },
] as const;

export const BUSINESS_MODEL = [
  {
    label: "Primary",
    title: "B2B licensing",
    body: "Licensing to banks, fintechs and payment service providers.",
  },
  {
    label: "Planned",
    title: "Partner access",
    body: "API and dashboard access to authorized merchant profiles.",
  },
  {
    label: "Later",
    title: "Merchant analytics",
    body: "Subscription analytics for merchants in later stages.",
  },
] as const;

export const BUSINESS_MODEL_NOTE =
  "No lending, credit-scoring or regulated financial-product revenue is claimed at MVP stage.";

export const VISION =
  "Over time, MCBuse will become the trusted distribution and payments infrastructure through which approved stablecoin issuers can reach merchants and consumers — while the resulting data network supports better financial decisions.";

export const VISION_CAVEAT =
  "A direction, not a commitment. Everything above is subject to pilot results, partner discussions and applicable regulation.";

/* ── /company ─────────────────────────────────────────────────── */

export const COMMUNICATION_PRINCIPLES = [
  {
    title: "We say what stage we're at.",
    body: "MVP and pilot preparation. Not a live production payment network.",
  },
  {
    title: "We name the boundary.",
    body: "Regulated execution, compliance and lending decisions sit with licensed partners.",
  },
  {
    title: "We don't claim decisions we don't make.",
    body: "MCBuse shows whether a history is ready to be assessed. It never approves anyone.",
  },
] as const;

/* ── /demo ────────────────────────────────────────────────────── */

export const SANDBOX_ITEMS = [
  {
    n: "01",
    title: "Simulated payment capture",
    body: "Push synthetic QR and NFC payment events through the capture layer.",
  },
  {
    n: "02",
    title: "Dashboard behaviour",
    body: "Watch daily and hourly aggregates rebuild as events arrive.",
  },
  {
    n: "03",
    title: "Payout exceptions",
    body: "Trigger delayed and missing payout states and see how they surface.",
  },
  {
    n: "04",
    title: "Readiness indicators",
    body: "See how data-consistency checks change a readiness status.",
  },
] as const;
