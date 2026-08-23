# MCBuse — Colosseum Hackathon Team Brief

**Audience:** Product, business, marketing, customer-validation, operations, and presentation team members  
**Prepared:** August 22, 2026  
**Planned hackathon period:** September 28–November 2, 2026  
**Status:** Plain-language companion to the detailed hackathon build plan

> The event dates and final rules must be checked when official registration opens.

---

## 1. The decision in one page

### What MCBuse is

MCBuse is a merchant data and financial intelligence company for unbanked and under-documented commerce. Its first wedge is to turn stablecoin payments into trusted merchant financial histories.

It turns fragmented merchant transaction data into two valuable outputs:

1. **Financial analytics** that help the merchant understand business activity.
2. **Credit readiness** that helps the merchant build an explainable, lender-ready profile.

The story must always be told in this order:

1. **We are:** a merchant data and financial intelligence company.
2. **Our hackathon wedge is:** stablecoin payments that become structured, verifiable merchant activity data.
3. **We already have:** a mobile payment application that can become our first consistent payment and data-generation surface.
4. **We build:** a large-scale, longitudinal, provider-independent merchant financial record.
5. **We provide merchants now:** useful financial analytics.
6. **We enable merchants next:** credit readiness and a lender-ready profile.
7. **We provide institutions over time:** better data for credit, product, portfolio, and market decisions.
8. **We use stablecoins for:** low-cost digital commerce that produces consistent, machine-verifiable payment data.
9. **We use Solana in the demo as:** the fast, low-cost network carrying the test stablecoin payment and integrity proof. It is an implementation choice, not the company story.
10. **We leave to institutions:** underwriting and every final financial decision.

Many small merchants have real businesses and regular sales but cannot demonstrate their creditworthiness. Their records may be incomplete, cash-heavy, spread across different services, or difficult for a lender to trust. This can prevent an otherwise viable merchant from being properly assessed for a loan or other form of credit.

MCBuse helps the merchant build a reliable financial-data history from everyday activity. It shows:

- which sales have been verified;
- how the business is performing across time;
- transaction totals, frequency, typical sale size, and trading rhythm;
- how much reliable history has been collected;
- whether important information is missing;
- whether the record is ready to share for a credit assessment;
- how an authorized lender can verify that the shared record was not changed.

### What MCBuse does not do

MCBuse does not approve or reject loans. It does not decide interest rates, loan amounts, repayment terms, or whether a merchant is creditworthy enough to receive money.

The distinction is simple:

> **MCBuse organizes the merchant's data, produces financial intelligence, and prepares verifiable credit evidence. A licensed lender makes the credit decision.**

### The hackathon objective

The team should demonstrate one complete story:

> A merchant receives a small stablecoin payment, MCBuse turns it into trusted financial data, the merchant sees updated business analytics and credit readiness, and the merchant shares a verifiable profile with a lender.

The judges should understand this story within three minutes.

### The wedge and the broad vision

The team must communicate MCBuse in two horizons, always in this order.

#### Horizon 1 — the hackathon wedge

Prove one tight loop: a stablecoin payment becomes a verified merchant record, useful financial analytics, an explainable credit-readiness profile, and merchant-authorized evidence for a lender. This is the product the team must build and demonstrate now.

Stablecoins matter because they are programmable, digitally verifiable payment instruments that can create clean activity data as money moves. Solana is the network selected for the hackathon implementation; the value proposition is not tied to one blockchain winning.

#### Horizon 2 — the long-term Stablecoin App Store and distribution platform

Unbanked and under-documented merchants generate enormous amounts of economic activity, but banks and other large institutions cannot use what they cannot reliably see.

MCBuse's long-term opportunity is to build the trusted data infrastructure for this hidden merchant economy:

- capture merchant activity consistently over time;
- turn fragmented events into standardized financial records;
- return useful analytics and readiness guidance to merchants;
- help merchants build visible financial identities without reducing them to a wallet score;
- provide banks, microfinance institutions, insurers, development organizations, and other authorized partners with better decision inputs;
- create aggregated insight into underserved merchant markets without exposing individual merchants improperly.

At scale, the value is not one payment or one readiness report. It is a longitudinal dataset that can help institutions understand merchants they could not previously assess or serve responsibly.

The same payment and data foundation can later support a second strategic arm: a trusted distribution and payments layer through which approved stablecoin issuers integrate once and reach merchants and consumers through MCBuse. Instead of each issuer rebuilding merchant acceptance, QR payments, identity connections, APIs, compliance controls, liquidity access, and settlement integrations, MCBuse can provide common infrastructure.

That long-term platform may include:

- a standardized registry of issuers and stablecoins;
- jurisdiction-aware admission, risk, and status controls;
- common APIs and software integrations for issuers;
- routing between an accepted customer asset and the merchant's preferred settlement currency;
- liquidity, foreign-exchange, and settlement connections through appropriately licensed partners;
- merchant, consumer, and issuer interfaces;
- transaction intelligence generated by the payment and data network.

The connection between the two horizons is simple:

> **The hackathon proves that stablecoin commerce can create trustworthy merchant intelligence. The long-term platform uses that trusted payment, data, and merchant network to distribute compliant stablecoins into the real economy.**

MCBuse therefore does not need to predict which stablecoin or blockchain will dominate. Its long-term position is the trusted environment through which suitable stablecoins reach real merchants, while the merchant retains useful intelligence and control over their data.

The team must not imply that this long-term platform already exists. Multi-issuer onboarding, stablecoin certification, liquidity routing, foreign exchange, fiat settlement, custody, and production compliance operations are future, jurisdiction-dependent capabilities—not hackathon deliverables.

The separate long-term concept calls a Stablecoin Store plus QR network an “MVP.” For this hackathon, that is a future platform phase. It does not replace or enlarge the focused Horizon 1 demonstration.

### Where the existing mobile app fits

MCBuse already has a mobile application for payments. That is an important product asset and should be included in the story.

The mobile app is:

- the existing payment experience;
- the first planned first-party source of merchant activity data;
- a future distribution channel for merchant analytics and readiness feedback;
- proof that MCBuse is not beginning with a data idea alone—it already has a payment surface from which data can be generated.

The app is not yet the complete merchant data product. The new data layer must still verify, standardize, and measure the quality of payment events before banks or merchants can rely on them. For the hackathon, the team should reference and show the existing app as an asset but avoid expanding it if that would endanger the focused data-layer demonstration.

### The data flywheel

1. Merchants receive stablecoin payments through MCBuse and later through approved payment providers.
2. Each transaction creates a verified activity event.
3. MCBuse converts those events into a trusted longitudinal record.
4. Merchants receive financial analytics and clearer credit-readiness guidance.
5. Better merchant value encourages more consistent activity and stronger histories.
6. With consent, institutions receive better assessment and market intelligence.
7. Better-designed institutional products create more value for participating merchants.
8. Over time, more approved stablecoins and issuer integrations expand merchant reach, payment volume, and the data network.

This must be a trusted data partnership—not unrestricted sale of merchants' raw records.

---

## 2. The merchant problem

Consider a food seller, kiosk owner, market trader, salon, repair shop, or other micro-business that makes many small sales.

The merchant may be financially active but still appear invisible to a lender because:

- many sales are made in cash;
- digital sales are scattered across different providers;
- the merchant has no consistent business record;
- screenshots and statements are difficult to verify;
- the merchant cannot clearly show sales frequency or stability;
- lenders cannot tell whether the available information is complete;
- every loan application requires the merchant to rebuild the story from the beginning.

The problem is therefore not only the absence of a credit score. The merchant first needs a trustworthy financial-data foundation. Without it, the merchant gets neither useful business insight nor a credible path to responsible credit assessment.

---

## 3. The MCBuse solution

MCBuse turns everyday sales activity into a trusted merchant data asset. That asset powers both a financial-analytics journey and a credit-readiness journey.

### Before MCBuse

The merchant has business activity but limited financial visibility and proof. Both the merchant and a future lender see an incomplete or unreliable picture.

### With MCBuse

The merchant can:

1. create a simple business profile;
2. agree to the collection and use of relevant business activity;
3. receive a small customer payment;
4. see the verified sale added to a business history;
5. understand sales totals, frequency, typical sale size, trading rhythm, and recent trends;
6. understand whether enough reliable history has been collected;
7. see what is preventing the profile from being assessment-ready;
8. authorize a shareable profile that a lender can check is genuine and unchanged.

### What changes for the merchant

The merchant moves from:

> “I run a real business, but I cannot prove it clearly.”

to:

> “Here is the trusted financial record of my business, here is what it tells me about performance, and here is a profile you can independently check before assessing me for credit.”

---

## 4. The hackathon product modules

The hackathon does not need to deliver the full long-term MCBuse platform. It needs the following eight connected parts.

### Module 1 — Merchant setup and consent

The merchant creates a basic profile and confirms that MCBuse may collect the relevant sales information.

The demo must show:

- who the merchant is;
- that the merchant completed the required setup;
- that the merchant agreed to the use of the data;
- that the merchant remains in control of sharing the final profile.

### Module 2 — A simple customer payment

The merchant creates a QR code for a small sale. A customer scans the code and pays the merchant in test USDC, a stablecoin, over Solana.

The payment is important because it creates a real, independently checkable sale for the demonstration. MCBuse already has a mobile payment app, which is the first strategic source of future first-party merchant data. The hackathon may use a supported test wallet for reliability; it does not need to rebuild the app to prove the data story.

MCBuse is not being presented as another payment app. The app is the capture surface; the merchant data and intelligence layer is the broader company.

### Module 3 — Verified sales history

MCBuse confirms that the payment is real, belongs to the correct merchant, has the correct amount, and has not already been counted.

The merchant then sees the sale in a clear transaction history.

### Module 4 — Financial analytics

The merchant sees a simple picture of business activity, including:

- verified sales totals and trends;
- number of sales;
- active trading days;
- typical sale size;
- hourly and daily trading rhythm;
- changes across the selected period;
- whether the collected information is complete and reliable.

The purpose is not to overwhelm the merchant with charts. It is to turn captured data into useful financial visibility.

For the hackathon, these analytics describe verified incoming sales. They do not represent profit, expenses, affordability, debt, or complete business cash flow because those inputs are not yet captured.

### Module 5 — Credit-readiness profile

MCBuse explains whether the merchant has enough reliable evidence to be assessed.

The demonstration will use four understandable states:

1. **Not enough history** — too little activity has been observed.
2. **Building history** — useful activity exists, but more time or sales are needed.
3. **Ready for assessment** — the agreed evidence requirements have been met.
4. **Information needs review** — an important inconsistency or missing record must be resolved.

The merchant must be able to see why a state was given and what needs to happen next.

These states measure readiness of the evidence. They are not a loan approval or predictive credit score.

### Module 6 — Merchant-authorized sharing

When the profile is ready, the merchant chooses whether to share it. MCBuse creates a protected assessment package containing only the information required for the purpose.

The merchant's detailed sales history should not be published publicly.

### Module 7 — Lender verification view

A lender or other authorized assessor opens a verification page and confirms that:

- the profile belongs to the expected merchant;
- the profile is current;
- the evidence has not been changed;
- the readiness result can be explained from the visible information.

This is the moment that demonstrates why trustworthy evidence matters. The hackathon implementation uses Solana to provide an independent proof that the shared profile has not been secretly altered.

### Module 8 — Internal support view

The MCBuse team needs a small internal view showing:

- which merchants completed setup;
- whether sales are being captured correctly;
- whether any information needs review;
- whether the product is operating normally;
- whether profiles were successfully created and verified.

This is a basic support tool, not a full operations platform.

---

## 5. The three-minute demonstration

### 0:00–0:20 — Show the problem

Introduce a micro-merchant who generates valuable transaction data every day, but the data is fragmented and produces neither useful financial insight nor credible evidence for a lender.

### 0:20–0:35 — Explain MCBuse

Say:

> “MCBuse turns stablecoin payments from under-documented merchants into trusted financial histories, analytics, and explainable credit readiness.”

### 0:35–1:05 — Set up the sale

Show that the merchant has completed setup and consent. Create a small payment and display the QR code.

### 1:05–1:35 — Complete the payment

Scan the QR code and make the test payment. Show the independent public payment record.

### 1:35–2:05 — Show trusted data and analytics

Return to MCBuse and show that the sale has appeared in the merchant's history. Show the updated totals, transaction rhythm, recent trend, and information-quality status.

### 2:05–2:30 — Explain credit readiness

Show the merchant's readiness state. Explain what has passed, what is missing, and what the merchant must do next.

### 2:30–2:50 — Share and verify

The merchant authorizes the assessment package. Open the lender view and confirm that the profile is genuine and unchanged.

### 2:50–3:00 — Present the vision

Connect the demonstration to the existing MCBuse mobile payment app. Explain that each future stablecoin payment can strengthen a consented merchant history: analytics create immediate value, credit readiness creates a financing path, and the growing dataset can help banks and other institutions make better financial decisions. Then state the longer-term direction in one sentence: approved stablecoin issuers will be able to integrate once with MCBuse and reach its merchant payment network. Institutions retain every approval, underwriting, and regulatory decision.

---

## 6. What must be real in the demonstration

The submission must include:

- one real test payment rather than a completely simulated payment;
- a working merchant profile and consent flow;
- a visible verified sales history and useful financial analytics;
- an explainable readiness result;
- a merchant-controlled sharing step;
- an independently checkable lender view;
- a publicly accessible demonstration;
- a short pitch video;
- a separate product walkthrough;
- evidence from at least five target-merchant interviews.

The team may use clearly labelled sample history to show how a 30-day profile would behave. Sample information must never be presented as real customer traction.

---

## 7. What is deliberately excluded

The following items are not required for the hackathon:

- issuing a loan;
- approving or rejecting a borrower;
- setting a credit score, loan amount, interest rate, or repayment term;
- holding customer or merchant money;
- launching with real funds;
- full identity or business-verification operations;
- NFC payments;
- rebuilding or expanding the existing mobile payment application;
- complete Stripe payment and payout matching;
- multiple payment providers;
- refunds and disputes beyond keeping records accurate;
- advanced artificial intelligence;
- accounting integrations;
- expansion into several countries;
- a full bank, wallet, payment processor, or point-of-sale product;
- a multi-issuer stablecoin marketplace or certification program;
- production stablecoin routing, liquidity, foreign exchange, fiat settlement, or custody.

If a feature does not strengthen the three-minute data-to-analytics-to-credit-readiness story, it should wait until after the hackathon.

---

## 8. How the team should describe MCBuse

### Approved title

**MCBuse — Financial Intelligence for Underserved Commerce**

### Approved tagline

**Turning stablecoin commerce into merchant financial intelligence.**

### Approved short description

**MCBuse turns everyday stablecoin payments from under-documented merchants into trusted financial histories—powering financial analytics and credit readiness.**

### Approved long-term vision line

**Over time, MCBuse will become the trusted distribution and payments infrastructure through which approved stablecoin issuers can reach merchants and consumers—while the resulting data network supports better financial decisions.**

### Language to use

- merchant data and financial intelligence;
- a trusted data layer for unbanked and under-documented merchants;
- the existing MCBuse payment app as the first data-generation surface;
- stablecoin payments as the initial data-capture wedge;
- financial analytics from verified sales;
- credit readiness;
- verified sales history;
- lender-ready merchant profile;
- under-documented micro-merchants;
- clear readiness gaps;
- merchant consent and control;
- independently verifiable evidence;
- preparation for responsible credit assessment;
- institutional decision intelligence built with consent.

### Language not to lead with

- generic payment gateway;
- another crypto wallet;
- Solana application;
- banking for the unbanked;
- sharing-economy infrastructure;
- artificial-intelligence credit scoring;
- automated underwriting;
- lending platform;
- buy now, pay later.

These phrases either describe a different product or place MCBuse inside a much broader and more crowded category.

### Important communication boundary

Do not say:

- “MCBuse decides whether a merchant is creditworthy.”
- “MCBuse guarantees access to a loan.”
- “This merchant has been approved.”
- “The profile predicts that the merchant will repay.”

Say:

- “MCBuse helps the merchant build evidence of business performance.”
- “MCBuse shows whether the available history is ready for assessment.”
- “The merchant can share a verifiable profile with an authorized lender.”
- “The lender remains responsible for the credit decision.”

---

## 9. Competitive positioning and crowdedness

MCBuse has previously been described as payment or banking infrastructure. Those descriptions placed it in Colosseum categories containing 202–223 projects.

An earlier credit-readiness-only description pointed toward an estimated category containing 184 projects. The new merchant-data and financial-intelligence story changes the wording materially, so 184 is no longer a valid current estimate. The team must rerun the crowdedness check before using a number in the submission.

The lower number is useful, but it is not the main strategy. MCBuse must still be clearly different from:

- payment applications that only accept and settle money;
- recordkeeping applications that only organize sales;
- lenders that make loan decisions;
- credit-scoring products that produce a risk number;
- loyalty applications that reward purchases.

MCBuse's strongest distinction is:

> **A merchant-controlled financial-data network that turns stablecoin payments into analytics and credit readiness for merchants, and better decision intelligence for authorized institutions.**

Current companies already use transaction information for small-business lending, and other products help merchants organize business records. The team should not claim that transaction analytics or alternative data for credit are completely new. The stronger claim is that MCBuse combines an existing payment surface, first-party merchant data generation, provider-neutral records, merchant-facing analytics, visible data quality, readiness guidance, consent, portability, and independent verification.

MCBuse should describe itself as a trusted data partner, not a data broker. Institutions receive merchant-authorized individual evidence or appropriately aggregated insight—not unrestricted access to raw merchant records.

---

## 10. What winning looks like

The team should optimize for six outcomes.

### 1. The product works

The payment, trusted-data update, financial analytics, readiness result, sharing step, and lender verification all work in one continuous demonstration.

### 2. The problem is credible

At least five target merchants confirm that fragmented records and difficulty proving business activity are real barriers or concerns.

### 3. The idea is focused

A judge can repeat the product story after hearing it once.

### 4. Stablecoins have a necessary role

A real test stablecoin payment creates the source activity for the merchant record. Solana carries that payment and the integrity proof in the hackathon implementation; it is not the headline product category.

### 5. The business can continue after the hackathon

The team can explain who benefits, who may eventually pay, and how partners such as lenders or payment providers could participate.

### 6. Every claim is honest

The team separates real functionality, sample information, interview evidence, future plans, and assumptions.

---

## 11. Work that must be completed

### Product and business work

- confirm the official rules, dates, eligibility, and submission requirements;
- approve one target merchant profile;
- approve the final problem statement, title, tagline, and short description;
- define the minimum financial analytics that are useful and honest from captured sales data;
- define the initial readiness requirements in language a merchant can understand;
- document every public claim and the evidence supporting it;
- prepare a simple market opportunity and business model;
- define the boundary between MCBuse and licensed lenders;
- review consent, privacy, custody, and compliance language.

### Customer-validation work

- recruit at least five relevant micro-merchants;
- interview them about recordkeeping, financial visibility, sales evidence, and access to finance;
- test whether the proposed analytics help merchants make a real decision;
- test whether the phrase “lender-ready profile” is understandable and credible;
- test whether merchants understand the four readiness states;
- test the setup, payment, history, and sharing journey;
- record anonymized findings and permissioned quotes;
- change the product story when evidence contradicts an assumption.

### Product-delivery work

- build the eight modules described in this brief;
- create realistic sample histories for the four readiness states;
- make the product usable on a phone-sized screen;
- ensure the merchant can understand every important status;
- provide a safe backup demonstration using a previously completed real test payment;
- publish a working demonstration that judges can access;
- rehearse the complete flow at least three times without failure.

### Submission and communication work

- create the three-minute pitch video;
- create a separate product walkthrough;
- prepare screenshots and a simple architecture illustration;
- publish the source code and clear setup instructions;
- prepare the final Colosseum description using the approved wording;
- verify that every link works;
- submit early enough to correct upload or platform problems;
- prepare responses to likely questions about regulation, privacy, lenders, competition, and sample data.

---

## 12. Team ownership

### Asim — product, business, finance, and risk

Asim owns:

- final scope and product claims;
- the business model and market opportunity;
- lender and partner story;
- consent, compliance, and regulatory language;
- the explanation of how MCBuse supports credit readiness without becoming the lender;
- confirmation of the official hackathon requirements.

### Frederick — product delivery and demonstration

Frederick owns:

- delivery of the working product;
- the real payment and verified-history flow;
- the readiness profile and verification experience;
- security, reliability, testing, and deployment;
- the technical walkthrough;
- early warning when scope must be reduced.

### Berk — merchant validation, marketing, and presentation

Berk owns:

- recruiting and interviewing target merchants;
- summarizing what the interviews prove or disprove;
- testing whether merchants understand the product language;
- the clarity and visual flow of the demonstration;
- the pitch narrative and launch communication;
- coordination of the pitch recording and submission materials.

### Whole team

The whole team owns:

- approving one consistent story;
- checking every public claim;
- rehearsing the demonstration;
- answering judge and community questions;
- refusing to hide incomplete functionality;
- protecting the submission from last-minute scope expansion.

---

## 13. Calendar and decision gates

### By August 30 — Agree on the story

The team must have:

- confirmed the event requirements available at that time;
- approved the target merchant and problem;
- approved the title, tagline, and short description;
- scheduled at least five merchant interviews;
- agreed on what will and will not be built.

### By September 6 — Prove the central idea can work

The team must have:

- completed one real test payment;
- confirmed that the payment can be connected to the correct merchant;
- selected the method used to prove that a shared profile has not changed;
- removed or simplified any part that cannot be demonstrated reliably.

### By September 20 — Establish the product foundation

The team must be able to demonstrate:

- merchant access;
- merchant setup and consent;
- the basic structure of the business history;
- the first version of the merchant experience.

### By September 27 — Complete the early end-to-end path

A payment or a safe replay of a real payment must become one correct merchant sales record. The main demonstration risks and fallback plan must be documented.

### September 28–October 4 — Make the payment flow reliable

Complete the repeatable journey from QR code to verified merchant sale and publish the first internal preview.

### October 5–11 — Make merchant value visible

Complete the sales history, financial analytics, information-quality warnings, and first usability session.

### October 12–18 — Complete the credit-readiness story

Show all four readiness states, merchant-authorized sharing, and independent lender verification.

### October 19–25 — Make the product dependable

Complete the internal support view, privacy and access protections, sample data, public demonstration, documentation, and final reliability work. Stop adding features at the end of this period.

### October 26–November 2 — Submit

Fix only serious problems. Record the pitch and walkthrough, rehearse the exact demonstration, verify every claim and link, and submit before the final deadline.

---

## 14. Scope-cutting rule

If the team falls behind, remove work in this order:

1. downloadable PDF profile;
2. a second payment provider;
3. advanced charts;
4. advanced internal support actions;
5. installation and visual polish;
6. non-essential profile-management features.

Never remove:

- the real test payment;
- the verified merchant sales record;
- protection against counting the same sale twice;
- the understandable credit-readiness result;
- merchant consent;
- the shareable profile;
- independent verification;
- privacy and access controls;
- the deployed demonstration;
- merchant interviews and honest submission evidence.

---

## 15. Business model to explain

The team should present a staged business model rather than claiming immediate lending revenue.

1. **Merchant analytics product:** free or affordable tools that help merchants organize verified activity, understand performance, and track readiness.
2. **Data and evidence services:** authorized organizations pay to receive standardized, consented merchant data and verify assessment profiles.
3. **Institutional decision intelligence:** banks and other authorized organizations may pay for portfolio monitoring, merchant segmentation, product design, and market insight based on consented or appropriately aggregated information.
4. **Ongoing intelligence services:** partners may pay for updated analytics, evidence, data-quality monitoring, and workflow support.
5. **Future payment partnerships:** MCBuse may earn service or referral revenue through appropriately licensed payment partners.
6. **Future stablecoin distribution infrastructure:** approved issuers may pay for integration, distribution, API access, payment processing, and compliance or reporting services once the required partnerships and legal permissions exist.

The long-term defensible asset is the large-scale, longitudinal, merchant-controlled financial dataset, the intelligence produced from it, and the trust around it.

---

## 16. Decisions required to unblock W03

The team should explicitly approve or amend these six decisions:

1. **Demonstration payment:** use a small USDC stablecoin payment through Solana Pay on devnet; describe USDC as the payment instrument and Solana as the implementation network.
2. **Primary outcome:** verified merchant activity becomes a trusted financial-data record that powers financial analytics and an explainable, lender-ready profile; institutional decision intelligence is the scale vision, not hackathon functionality.
3. **Credit boundary:** MCBuse prepares evidence but does not approve, price, fund, or service a loan.
4. **Product boundary:** focus implementation on the new merchant data layer and portal. Treat the existing mobile payment app as a strategic capture asset and presentation proof point, but do not rebuild or expand it during the hackathon.
5. **Delivery priority:** the complete demonstration and submission evidence take priority over payout matching and all optional features until submission.
6. **Data-trust boundary:** MCBuse does not sell unrestricted raw merchant records. Identifiable evidence requires a clear purpose and merchant authorization; broader institutional insight must protect individual merchants and all access must be controlled.

W03 is complete when the team has agreed on these decisions, assigned the outstanding work, and stopped introducing conflicting product descriptions.

---

## 17. Final team checklist

Before submission, every team member should be able to answer “yes” to the following:

- Can I explain the merchant problem without mentioning technology first?
- Can I explain why MCBuse is a data company rather than a payment company?
- Can I explain how verified sales create both financial analytics and credit readiness?
- Can I state clearly that MCBuse is not the lender?
- Can I repeat the approved one-sentence description?
- Have at least five relevant merchants informed the product?
- Does the demonstration tell one continuous story?
- Is sample information clearly labelled?
- Can a lender independently verify the shared profile?
- Is the merchant in control of sharing?
- Is every public claim supported by evidence?
- Have we removed features that distract from the core story?
- Can the complete demonstration succeed three times in a row?

---

## 18. Plain-language glossary

**Credit readiness:** Having enough reliable information to be properly assessed for credit. It is not approval.

**Creditworthiness:** A lender's view of whether a borrower is likely and able to meet credit obligations. MCBuse supplies evidence; the lender reaches the conclusion.

**Financial analytics:** Useful views of verified sales activity, such as totals, frequency, typical sale size, active days, and trends. In the hackathon, this does not mean profit, expenses, affordability, or complete cash flow.

**Merchant financial-data layer:** The trusted, provider-independent history from which MCBuse produces analytics and credit-readiness evidence.

**Longitudinal merchant data:** Merchant activity observed consistently over time, making trends and changes more useful than a one-time snapshot.

**Institutional decision intelligence:** Consented individual evidence or appropriately aggregated insight that helps banks and other institutions assess merchants, monitor portfolios, design products, or understand markets. The institution still makes the final decision.

**Lender-ready profile:** An understandable collection of verified business information that a merchant can present for assessment.

**Verified sale:** A sale that MCBuse can independently confirm rather than accepting only a manual claim.

**Consent:** The merchant's clear permission to collect or share information for a stated purpose.

**Stablecoin:** Digital money designed to track a reference currency, such as the US dollar. MCBuse uses a test stablecoin payment to create a verifiable merchant activity record.

**Solana:** The public network selected to carry the hackathon's test stablecoin payment and integrity proof. It supports the demonstration but is not the main company story.

**USDC:** A digital representation of US dollars used as test payment money in the demonstration.

**Test network:** A safe version of the Solana network where demonstration funds have no real monetary value.

**Independent verification:** Allowing another party to check that the profile is genuine and unchanged without simply trusting MCBuse's claim.

---

## Related documents

- [Detailed hackathon build scope](./colosseum-hackathon-scope.md)
- [Team plan](./team_plan.md)
- [Month 1 scope-freeze record](./month1-scope-freeze.md)
