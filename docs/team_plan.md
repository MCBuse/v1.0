# MCBuse 12-Month Project Plan

## Team Work Distribution, Roadmap, Tracking System and Pilot Execution Plan

**Project start:** Q3

**Planning horizon:** 12 months

**Team:**

- Asim Emre Aci — Project Lead / Business, Finance, KPI and Partner Coordination
- Frederick Obeng Nyarko — Engineering Lead / Product, Architecture and MVP Development
- Berk Ozkan — Marketing Lead / Customer Discovery, GTM and Pilot Operations

**Document purpose:**

This document is not only a project report. It is the internal execution plan for the MCBuse team. Its purpose is to make sure every team member knows what they are responsible for, what must be delivered each month, how progress will be tracked, and how the team will move from concept and sandbox demo status toward a pilot-ready Data-Capture MVP.

---

# 1. Strategic Direction

MCBuse is developing a partner-enabled QR/NFC Data-Capture MVP for low-ticket Micro-SME merchants in Munich and Berlin.

The project is based on one central principle:

**Payment acceptance is the first data-capture channel; the structured merchant activity record is the actual product.**

### Story alignment — August 22, 2026

MCBuse should be presented as a **merchant data and financial intelligence company for unbanked and under-documented commerce, using stablecoin payments as its first focused wedge**. The solution and delivery architecture do not change; the story now makes the value hierarchy explicit:

1. a stablecoin payment is the bounded hackathon wedge and the first machine-verifiable activity event;
2. the existing MCBuse mobile payment app is the first strategic payment, distribution, and data-generation surface;
3. fragmented merchant transactions become a trusted, longitudinal, provider-independent financial-data record;
4. that record produces financial analytics for the merchant;
5. the same record produces explainable credit readiness and lender-verifiable evidence;
6. at scale, consented and appropriately aggregated data supports better credit, product, portfolio, and market decisions by banks and other institutions;
7. over the long term, approved stablecoin issuers can integrate once with MCBuse and reach its merchant and consumer network through common payment and distribution infrastructure;
8. Solana is the selected network for the hackathon payment and proof, not the headline company category;
9. institutions retain underwriting and every final financial decision.

The concise company story is:

> **MCBuse turns everyday stablecoin payments from under-documented merchants into trusted financial histories—powering financial analytics and credit readiness.**

The current mobile app proves that MCBuse already has a payment product surface, but it does not yet produce the canonical, lender-grade merchant dataset described in this vision. The new data-capture layer must verify, standardize, and measure the quality of app and partner events before those events can support merchant or institutional decisions. Mobile implementation remains outside the current hackathon scope.

MCBuse should operate as a trusted data partner, not an unrestricted data broker. Individual merchant evidence requires clear purpose and consent; broader institutional insight should be appropriately aggregated or de-identified; all access should be controlled and auditable.

MCBuse should not be positioned only as a payment company. The first MVP uses payment-event capture to create structured merchant data, payout visibility, exception signals, and simple business insights for merchants who process frequent low-ticket transactions.

The project focuses on merchants who usually process small transactions between approximately EUR 0.10 and EUR 10 and who face problems such as:

- Cash-heavy workflows
- Minimum card-payment thresholds
- Payout uncertainty
- Fee sensitivity
- Lack of structured transaction records
- Limited administrative capacity
- Trust concerns around new digital payment solutions

The MVP must remain focused, testable, and realistic for the EXIST period.

---

# 2. What We Are Building

## 2.1 MVP Scope

The first technical build focuses on a partner-enabled QR/NFC data-capture layer for low-ticket Micro-SME merchants.

The MVP should include:

1. Lightweight merchant onboarding
2. Merchant profile creation
3. Consent capture
4. Partner-approved KYB steps where required
5. QR/NFC payment-event capture
6. Transaction event structuring
7. Payout-status matching where partner data is available
8. Exception detection logic
9. Merchant insights dashboard
10. Internal admin monitoring panel
11. Data quality and KPI tracking
12. Secure data storage and access control
13. Partner-ready integration structure

## 2.2 MVP Outputs

The MVP must produce the following outputs:

### Merchant onboarding outputs

- Merchant profile
- Merchant ID
- Consent status
- Onboarding completion status
- KYB status, if required by partner flow

### Transaction data outputs

Each transaction record should include:

- Amount
- Timestamp
- Merchant ID
- Payment method
- Transaction status
- Transaction reference ID
- Partner/payment provider reference, where available

### Structured event object

The event schema should support:

- Transaction amount
- Transaction time
- Merchant identifier
- Payment status
- Payout status
- Payment method
- Matching status
- Exception status

### Payout visibility outputs

- Expected payout amount
- Expected payout date
- Completed payout confirmation
- Matched/unmatched payout status
- Delayed payout flag
- Missing payout flag

### Merchant dashboard outputs

The merchant dashboard should show:

- Today’s captured transaction total
- Number of transactions
- Expected payout amount
- Expected payout date
- Completed payouts
- Delayed or missing payout alerts
- Daily sales totals
- Hourly sales rhythm
- Digital transaction share
- Basic cash-vs-digital mix, if available
- Transaction history
- Payout clarity status

### Internal admin panel outputs

The admin panel should show:

- Merchant list
- Onboarding status
- Transaction count per merchant
- Capture quality
- Payout matching status
- Exception count
- Support flags
- Basic system health indicators
- KPI tracking status

---

# 3. What We Are Not Building in the First MVP

The first MVP should not become too broad. The following are out of scope unless specifically needed for a controlled demo or partner requirement:

- Full payment institution functionality
- Full POS system
- Banking product
- Lending product
- Credit scoring
- Independent payment license
- Full accounting integration
- Complex financial reporting
- Multi-country rollout
- Advanced AI analytics
- Full blockchain/stablecoin user-facing wallet
- Direct settlement ownership
- Safeguarding of customer funds
- AML/KYC ownership outside partner-approved flows
- Refund or dispute-resolution ownership

Stablecoin payment capture is part of the bounded hackathon wedge. The broader Stablecoin App Store direction—multi-issuer registration, admission standards, certification, routing, liquidity, foreign exchange, redemption, fiat settlement, custody, issuer dashboards, and production compliance operations—remains a long-term infrastructure vision. It must not be represented as current functionality or allowed to expand the hackathon build.

---

# 4. Current Assets and Development Status

The team already has several useful assets:

1. EXIST Idea Paper and Data-Capture MVP positioning
2. Initial merchant validation logic
3. Defined first validation cities: Munich and Berlin
4. Existing sandbox demo
5. Pitch video
6. Demo video and sandbox explanation
7. APK file
8. Stripe on-ramp sandbox test flow
9. Colosseum Frontier Hackathon participation
10. Marketing entry strategy
11. Marketing growth roadmap
12. Technical MVP scope
13. Preliminary budget plan
14. Initial role structure

## 4.1 Sandbox Demo Role

The current sandbox demo should be used as a learning and communication asset.

It should support:

- Technical review
- Advisor feedback
- Partner conversations
- MVP architecture discussion
- Early product explanation
- Pitch improvement
- Hackathon learning
- Payment-flow demonstration

The demo should not be treated as the final product. It is the starting point for a more focused, compliant, partner-enabled Data-Capture MVP.

## 4.2 Demo and Related Materials

The following materials are part of the current project context:

- Colosseum Frontier Hackathon[https://colosseum.com/frontier](https://colosseum.com/frontier)
- Pitch Video[https://www.loom.com/share/0493277c6c4947a3a6efd268536f155a](https://www.loom.com/share/0493277c6c4947a3a6efd268536f155a)
- Demo Video and Code / Sandbox Explanation[https://youtu.be/rK5wfWS7F9I](https://youtu.be/rK5wfWS7F9I)
- APK File[https://drive.google.com/drive/folders/157D7JMd9fJ3R5699YLho2795krfbabBH?usp=sharing](https://drive.google.com/drive/folders/157D7JMd9fJ3R5699YLho2795krfbabBH?usp=sharing)

### Stripe sandbox test details

Phone Number: +1 229 536 8628

Street Address: 4133 Veterans Memorial Drive

City: Batavia

State: NY

ZIP Code: 14020

Country: United States

Sandbox Test Card:

Card Number: 4242 4242 4242 4242

MM/YY: 09/29

CVC: 567

These details should be stored internally and used only for sandbox testing, not for public-facing materials.

---

# 5. Team Roles and Responsibilities

## 5.1 Role Overview

| Team Member | Main Role | Main Responsibility |
| --- | --- | --- |
| Asim Emre Aci | Project Lead | Project management, strategy, budgeting, KPI governance, partner/legal coordination, financing readiness |
| Frederick Obeng Nyarko | Engineering Lead | MVP development, technical architecture, data schema, dashboard, admin panel, security, integration readiness |
| Berk Ozkan | Marketing Lead | Customer discovery, merchant outreach, GTM, pilot onboarding, field feedback, activation and retention |

---

# 6. Detailed Role Definitions

## 6.1 Asim Emre Aci — Project Lead

Asim is responsible for making sure the full project moves forward on time and that business, technical, financial, and pilot activities remain aligned.

### Core responsibilities

- Own the 12-month execution plan
- Manage monthly milestones
- Set weekly priorities with the team
- Track budget usage
- Own KPI framework and reporting
- Coordinate advisor communication
- Coordinate partner and legal discussions
- Maintain project documentation
- Prepare business model assumptions
- Prepare pricing and revenue model validation
- Prepare pilot report structure
- Prepare financing and incorporation readiness materials

### Asim’s recurring deliverables

- Weekly project status update
- Monthly milestone review
- Budget tracker
- KPI dashboard review
- Partner/legal question list
- Risk register
- Decision log
- Final pilot report
- Post-project roadmap

### Asim’s KPIs

- Milestones delivered on time
- Budget variance controlled
- KPI dashboard updated monthly
- Partner/legal risks documented
- Pilot decision gates completed
- Final internal report completed

---

## 6.2 Frederick Obeng Nyarko — Engineering Lead

Fred is responsible for turning the concept and sandbox demo into a usable MVP architecture and product system.

### Core responsibilities

- Review and document the sandbox demo
- Define MVP technical architecture
- Define transaction event schema
- Build or coordinate the merchant onboarding flow
- Build QR/NFC payment-event capture logic
- Build transaction structuring logic
- Build payout-status matching logic
- Build exception detection logic
- Build merchant dashboard
- Build internal admin panel
- Set up KPI tracking infrastructure
- Ensure secure data storage
- Prepare technical documentation
- Maintain product backlog and bug list

### Fred’s recurring deliverables

- Demo audit note
- Technical architecture document
- Data schema document
- MVP backlog
- Sprint build updates
- Dashboard wireframes/prototype
- Admin panel prototype
- QA checklist
- Technical risk log
- Final technical documentation

### Fred’s KPIs

- MVP architecture completed
- Event schema completed
- Core MVP features delivered
- Capture quality target supported
- Admin panel functional
- Dashboard functional
- Secure data process documented
- Bugs tracked and resolved

---

## 6.3 Berk Ozkan — Marketing Lead

Berk is responsible for understanding merchants, building the go-to-market motion, managing outreach, supporting pilot onboarding, and collecting real field feedback.

### Core responsibilities

- Define and refine target merchant profiles
- Build merchant prospect lists
- Prepare interview scripts
- Conduct merchant interviews
- Build objection library
- Prepare pitch scripts
- Support Munich and Berlin cluster selection
- Prepare onboarding materials
- Collect pilot-intent signals and LOIs
- Support pilot merchant onboarding
- Track merchant activation
- Collect testimonials and feedback
- Prepare GTM playbook
- Support retention and merchant success process

### Berk’s recurring deliverables

- Merchant prospect database
- Interview guide
- Interview notes
- Persona/ICP document
- Objection library
- Pitch scripts
- Pilot merchant shortlist
- Onboarding kit
- Field feedback summary
- Case study drafts
- GTM playbook

### Berk’s KPIs

- Merchant conversations completed
- Qualified prospects identified
- Pilot-intent signals collected
- Signed pilot merchants
- Activated merchants
- Setup time measured
- Merchant objections documented
- Feedback loops completed

---

# 7. Team Operating System

The team should use one shared workspace, such as Notion, Trello, Asana, ClickUp, or Google Sheets.

## 7.1 Required Internal Tools

The team must maintain:

1. Project board
2. Monthly roadmap
3. Weekly sprint board
4. Task tracker
5. KPI dashboard
6. Budget tracker
7. Merchant CRM sheet
8. Partner/legal tracker
9. Product backlog
10. Risk register
11. Decision log
12. Meeting notes folder

## 7.2 Task Status Rules

Every task should have one of the following statuses:

- Not started
- In progress
- Waiting for input
- Blocked
- Under review
- Completed
- Dropped

## 7.3 Task Fields

Every task must include:

- Task title
- Owner
- Support person
- Due date
- Priority
- Output/deliverable
- Status
- Notes
- Link to file/output

## 7.4 Priority Levels

| Priority | Meaning |
| --- | --- |
| P0 | Critical: blocks the project |
| P1 | Important: needed for monthly milestone |
| P2 | Useful: improves quality but does not block milestone |
| P3 | Optional: later-stage or nice-to-have |

---

# 8. Meeting Rhythm

## 8.1 Weekly Team Meeting

**Frequency:** Once per week

**Duration:** 45–60 minutes

**Owner:** Asim

### Agenda

1. What was completed last week?
2. What is blocked?
3. What are the priorities this week?
4. Are we on track for the monthly milestone?
5. Are there product, pilot, or partner risks?
6. What decisions are needed?

### Output

- Updated sprint board
- Updated blockers
- Updated priorities
- Updated decision log

---

## 8.2 Product Review

**Frequency:** Every two weeks

**Owner:** Fred

### Agenda

1. MVP progress
2. Bugs and technical blockers
3. Data schema changes
4. Dashboard/admin panel status
5. Security and data quality issues
6. Feedback from merchants or demo users

### Output

- Updated product backlog
- Updated technical risk list
- Next sprint engineering priorities

---

## 8.3 GTM and Merchant Review

**Frequency:** Every two weeks

**Owner:** Berk

### Agenda

1. Merchant outreach progress
2. Interview results
3. Objections collected
4. Pilot-intent signals
5. City/cluster learning
6. Onboarding feedback

### Output

- Updated merchant CRM
- Updated objection library
- Updated outreach script
- Updated pilot shortlist

---

## 8.4 Monthly KPI Gate Review

**Frequency:** Once per month

**Owner:** Asim

### Agenda

1. Monthly milestone status
2. KPI progress
3. Budget status
4. Risk status
5. Team workload
6. Decision: continue, revise, narrow scope, or pause expansion

### Output

- Monthly KPI report
- Budget update
- Risk update
- Decision gate result

# 9. Core KPI Framework

## 9.1 Main Pilot KPIs

| **KPI** | **Target** | **Owner** | **Data Source** | **Review Frequency** |
| --- | --- | --- | --- | --- |
| Activation rate | >60% | Berk | Admin panel / onboarding log | Weekly during pilot |
| 30-day repeat usage | >50% | Asim + Fred | Dashboard analytics | Monthly |
| Capture quality | >95% | Fred | Transaction logs | Weekly |
| Median setup time | <20 minutes | Berk | Field onboarding form | Per merchant |
| Support burden | <30 minutes per active merchant/week | Berk + Asim | Support log | Weekly |
| Payout issue rate | <2–3% | Fred + Asim | Payout matching log | Weekly |
| Payout clarity score | ≥4/5 | Berk | Merchant survey | After first payout cycle |
| First transaction | Within 24 hours | Berk | Merchant activity log | Per merchant |
| Merchant retention | >50% at 30 days as base target | Asim + Berk | Usage analytics | Monthly |
| Pilot satisfaction | ≥4/5 | Berk | Merchant feedback | Monthly |

## 9.2 Commercial KPIs

| KPI | Target | Owner |
| --- | --- | --- |
| Merchant prospects listed | 120–160 | Berk |
| Qualified merchant conversations | 60–80 | Berk |
| Signed pilot merchants | 30–40 | Berk + Asim |
| Activated pilot merchants | 20–25 base target | Berk |
| LOIs / pilot-intent signals | 10–20 | Berk + Asim |
| Partner conversations | 5–10 | Asim |
| Pricing feedback responses | 30+ | Berk |

## 9.3 Product KPIs

| KPI | Target | Owner |
| --- | --- | --- |
| Onboarding flow completion | MVP-ready by Month 5–6 | Fred |
| Event schema completion | Month 2 | Fred |
| Dashboard v1 | Month 5–7 | Fred |
| Admin panel v1 | Month 7 | Fred |
| Exception logic v1 | Month 7 | Fred |
| KPI tracking setup | Month 7 | Fred |
| Technical documentation | Updated monthly | Fred |

---

# 10. Pilot Target Scenarios

Because pilot targets are still preliminary, the team should use three target levels.

## 10.1 Minimum Target

This is the minimum acceptable pilot result.

- 80 merchants approached
- 40 qualified conversations
- 20 signed pilot merchants
- 12–15 activated merchants
- Activation above 60%
- Capture quality above 90–95%
- Setup time below 25 minutes
- At least 5 meaningful merchant feedback interviews after usage

## 10.2 Base Target

This is the planning target.

- 120–160 merchants approached
- 60–80 qualified conversations
- 30–40 signed pilot merchants
- 20–25 activated merchants
- Munich/Berlin split: approximately 50/50
- Activation above 60%
- Capture quality above 95%
- Setup time below 20 minutes
- Repeat usage above 50%
- Payout clarity score at least 4/5

## 10.3 Stretch Target

This is the ambitious target if team capacity, product readiness, and partner readiness allow.

- 200+ merchants approached
- 100 qualified conversations
- 50–60 signed pilot merchants
- 35–40 activated merchants
- Activation above 70%
- Setup time below 15 minutes
- 30-day repeat usage above 60%
- Strong testimonials from 5–8 merchants
- Clear city-cluster playbook for Munich and Berlin

---

# 11. Budget Plan

The budget follows the Idea Paper structure and must be used to support MVP readiness, partner preparedness, merchant activation, data-quality validation, and pilot reliability.

## 11.1 Coaching Budget — EUR 5,000

| Coaching Area | Purpose | Planned Amount | Owner |
| --- | --- | --- | --- |
| Business model and go-to-market coaching | Target-segment refinement, pricing logic, pilot design, rollout playbook | EUR 1,500 | Asim + Berk |
| Compliance and partner-structure coaching | Operating model design, partner selection logic, pilot-stage legal readiness | EUR 1,500 | Asim |
| Pitch and investor readiness coaching | Financing narrative, KPI framing, post-EXIST fundability | EUR 1,000 | Asim |
| Sales and customer discovery coaching | Interview design, objection handling, merchant activation process | EUR 750 | Berk |
| Team and execution coaching | Milestone discipline and founder coordination | EUR 250 | Asim |
| **Total** |  | **EUR 5,000** |  |

## 11.2 Material / Supplies Budget — EUR 30,000

| Budget Line | Purpose | Planned Amount | Main Owner |
| --- | --- | --- | --- |
| Software development support / external technical services | MVP stability, integration, QA, bug fixing | EUR 9,000 | Fred |
| Cloud infrastructure, developer tools, software licenses | Secure hosting, monitoring, analytics, testing | EUR 4,000 | Fred |
| Pilot hardware and test devices | NFC-capable devices, QR materials, field testing | EUR 3,500 | Fred + Berk |
| Compliance, legal, and partner setup services | Contracts, privacy review, operating model, trademark/IP steps | EUR 6,500 | Asim |
| UX/UI refinement and user-testing materials | Improved onboarding and usability | EUR 2,000 | Fred + Berk |
| Market validation and pilot rollout materials | Merchant acquisition, POS materials, onboarding aids | EUR 3,000 | Berk |
| Travel and field expenses | Merchant interviews, partner meetings, pilot coordination | EUR 1,500 | Berk + Asim |
| Contingency / small operational purchases | Testing add-ons and unforeseen pilot requirements | EUR 500 | Asim |
| **Total** |  | **EUR 30,000** |  |

## 11.3 Budget Tracking Rules

- Asim owns the master budget tracker.
- Every expense must have a category, owner, amount, date, purpose, and receipt.
- Monthly budget review must happen in the monthly KPI gate meeting.
- No unplanned expense above EUR 300 should be approved without team discussion.
- Legal/compliance and technical infrastructure expenses should be prioritized over optional marketing experiments before pilot readiness is achieved.

---

# 12. 12-Month Roadmap Overview

| Month | Quarter | Main Theme | Main Output |
| --- | --- | --- | --- |
| Month 1 | Q3 | Project setup and role clarity | Internal execution system ready |
| Month 2 | Q3 | Technical scope and data schema | MVP requirements and event schema |
| Month 3 | Q3 | Demo review and partner/compliance framing | Scope freeze and partner-readiness plan |
| Month 4 | Q4 | Merchant discovery and ICP validation | Interview results and objection library |
| Month 5 | Q4 | Prototype refinement and onboarding | Onboarding prototype and dashboard mockup |
| Month 6 | Q4 | Pilot preparation and LOI expansion | Pilot cohort shortlist |
| Month 7 | Q1 | MVP build completion | MVP v1 internal test |
| Month 8 | Q1 | Pilot launch preparation | Onboarding kit and support SOPs |
| Month 9 | Q1 | Pilot onboarding | Activated pilot merchants |
| Month 10 | Q2 | KPI measurement and iteration | KPI report and iteration backlog |
| Month 11 | Q2 | Consolidation and case studies | Pilot report draft and GTM playbook |
| Month 12 | Q2 | Final internal report and next-stage plan | Post-EXIST operating plan |

---

# 13. Monthly Work Distribution

## Month 1 — Q3

## Project Setup, Team System and Scope Alignment

### Main objective

Create the internal operating system so that the team can work in a structured and trackable way.

### Asim tasks

- Create the master project board
- Create the 12-month roadmap board
- Create budget tracker
- Create KPI dashboard template
- Create risk register
- Create decision log
- Define team meeting structure
- Prepare initial project charter
- Align team on MVP boundaries
- Collect all existing documents in one shared folder

### Fred tasks

- Review sandbox demo
- Prepare demo audit note
- Identify what can be reused from the demo
- Identify what must be rebuilt
- List technical risks
- Create initial product backlog
- Define technical workstreams
- Review APK/demo flow
- Prepare initial architecture questions

### Berk tasks

- Create merchant CRM template
- Build first merchant segment list
- Review target customer assumptions
- Prepare first version of merchant interview script
- Prepare first version of objection library structure
- Review marketing roadmap and select priority outputs
- Prepare city/cluster research template for Munich and Berlin

### Shared outputs

- Internal execution board
- Project charter
- Role responsibility matrix
- Budget tracker
- KPI dashboard template
- Risk register
- Demo audit note
- Merchant CRM template

### Month 1 decision gate

Proceed if:

- Team roles are clear
- Project board is active
- MVP scope is understood
- Demo status is documented
- Every team member has weekly tasks

---

## Month 2 — Q3

## MVP Requirements, Data Schema and Validation Setup

### Main objective

Translate the MVP idea into technical requirements and validation tasks.

### Asim tasks

- Prepare partner/legal question list
- Define compliance boundary assumptions
- Prepare advisor feedback questions
- Prepare monthly reporting template
- Draft budget use assumptions for first 3 months
- Define KPI measurement responsibilities
- Start partner shortlist structure

### Fred tasks

- Define transaction event schema v1
- Define merchant profile data model
- Define onboarding data requirements
- Define payout-status matching fields
- Define exception flag fields
- Prepare MVP architecture v1
- Prepare dashboard requirements
- Prepare admin panel requirements
- Create product backlog with priorities

### Berk tasks

- Finalize interview guide v1
- Build first 50 merchant prospect list
- Define primary and secondary personas
- Prepare 30-second pitch v1
- Prepare 45-second pitch v1
- Prepare 2-minute explanation v1
- Begin competitor/alternative scan
- Prepare interview note template

### Shared outputs

- MVP requirements document v1
- Transaction event schema v1
- Merchant profile model v1
- Partner/legal question list
- Interview script v1
- Merchant prospect list v1
- Pitch scripts v1

### Month 2 decision gate

Proceed if:

- MVP requirements are written
- Data schema is clear enough for build planning
- Merchant interview process is ready
- Compliance boundaries are documented

---

## Month 3 — Q3

## Scope Freeze, Demo Feedback and Partner Readiness

### Main objective

Freeze the first MVP scope and use demo feedback to guide product development.

### Asim tasks

- Coordinate advisor/demo feedback
- Contact or prepare outreach to possible PSP/acquirer/EMI partners
- Update risk register
- Finalize MVP scope freeze document
- Prepare pricing validation questions
- Prepare first project status report

### Fred tasks

- Update architecture based on demo audit
- Prepare dashboard wireframe v1
- Prepare admin panel structure v1
- Define capture quality measurement logic
- Define secure data storage requirements
- Prepare technical documentation structure
- Identify external technical support needs, if any

### Berk tasks

- Start first merchant conversations
- Test pitch scripts with real users
- Collect objections
- Update ICP assumptions
- Build Munich cluster shortlist
- Build Berlin cluster shortlist
- Prepare merchant feedback summary v1

### Shared outputs

- MVP scope freeze document
- Architecture v1
- Dashboard wireframe v1
- Admin panel structure v1
- Partner shortlist v1
- First merchant feedback notes
- Objection library v1

### Month 3 decision gate

Proceed if:

- MVP scope is frozen
- Technical direction is agreed
- Partner/compliance assumptions are clear
- First merchant feedback supports the problem

---

## Month 4 — Q4

## Merchant Discovery and Go-to-Market Validation

### Main objective

Validate merchant pain points, objections, and willingness to test in Munich and Berlin.

### Asim tasks

- Review interview results weekly
- Update pricing assumptions
- Track budget use
- Prepare partner conversation notes
- Support Berk in structuring interview insights
- Define pilot decision criteria
- Update KPI dashboard structure

### Fred tasks

- Start onboarding prototype
- Start merchant dashboard prototype
- Define system requirements for pilot data capture
- Prepare initial QA checklist
- Review feasibility of QR/NFC flow
- Prepare data-quality checklist

### Berk tasks

- Conduct 20–30 merchant conversations
- Document objections
- Identify pilot-ready merchants
- Test Munich/Berlin pitch differences
- Prepare merchant persona v2
- Prepare city-cluster notes
- Collect early pilot-intent signals

### Shared outputs

- Merchant discovery report v1
- ICP v2
- Objection library v2
- Pricing feedback notes
- Onboarding prototype v1
- Dashboard prototype v1
- Pilot criteria list

### Month 4 decision gate

Proceed if:

- Merchant pain is clearly validated
- Objections are documented
- Pilot-ready merchant types are identified
- Onboarding prototype is usable for feedback

---

## Month 5 — Q4

## Onboarding, Dashboard and Pilot Readiness

### Main objective

Prepare the product and operations for pilot execution.

### Asim tasks

- Prepare compliance checklist v1
- Update partner/legal tracker
- Prepare pilot terms/questions
- Review budget requirements for pilot materials
- Define pilot reporting structure
- Prepare decision gate checklist for pilot launch

### Fred tasks

- Improve onboarding prototype
- Build dashboard prototype v2
- Define payout matching logic v1
- Define exception flag logic v1
- Prepare admin panel mockup
- Prepare KPI tracking events
- Prepare security/access-control checklist

### Berk tasks

- Conduct additional merchant interviews
- Collect LOIs/pilot-intent signals
- Prepare onboarding kit content
- Prepare merchant FAQ v1
- Prepare support script v1
- Prepare Day 1 / Day 3 / Day 7 merchant success sequence
- Prepare first landing page copy or pilot information page draft

### Shared outputs

- Onboarding prototype v2
- Dashboard prototype v2
- Payout matching logic v1
- Exception logic v1
- Merchant FAQ v1
- Support script v1
- Pilot-intent list
- Pilot readiness checklist

### Month 5 decision gate

Proceed if:

- Onboarding can realistically target below 20 minutes
- Pilot materials are understandable
- Dashboard provides clear merchant value
- Pilot merchants are being identified

---

## Month 6 — Q4

## Pilot Cohort Selection and MVP Build Preparation

### Main objective

Finalize pilot cohort assumptions and prepare for MVP build completion.

### Asim tasks

- Finalize base pilot target
- Prepare budget allocation for pilot period
- Prepare partner discussion summary
- Prepare pricing validation framework
- Prepare internal mid-project review
- Define city split assumptions

### Fred tasks

- Finalize MVP build backlog
- Prioritize must-have vs nice-to-have features
- Prepare technical sprint plan for Months 7–8
- Prepare API/integration readiness notes
- Finalize data model v1
- Finalize dashboard/admin panel development plan

### Berk tasks

- Finalize pilot merchant shortlist
- Continue collecting LOIs/pilot-intent signals
- Prepare onboarding schedule template
- Prepare field visit checklist
- Prepare merchant feedback survey
- Prepare pilot communication material

### Shared outputs

- Pilot cohort shortlist
- MVP build sprint plan
- Data model v1
- Dashboard/admin build plan
- Pricing validation framework
- Field visit checklist
- Mid-project review

### Month 6 decision gate

Proceed if:

- Pilot cohort shortlist exists
- MVP build priorities are clear
- Product and GTM teams are aligned
- Budget is ready for pilot execution

---

## Month 7 — Q1

## MVP v1 Build and Internal Testing

### Main objective

Build the core MVP and test it internally before merchant pilot use.

### Asim tasks

- Monitor milestone progress
- Coordinate feedback sessions
- Update KPI dashboard
- Review compliance risks
- Prepare internal testing checklist
- Track budget usage

### Fred tasks

- Build QR/NFC payment-event capture flow
- Build merchant onboarding v1
- Build transaction structuring logic
- Build payout matching logic v1
- Build exception flagging v1
- Build merchant dashboard v1
- Build admin panel v1
- Set up KPI tracking
- Conduct internal QA

### Berk tasks

- Prepare pilot launch communication
- Prepare merchant onboarding calendar
- Test onboarding instructions with non-technical users
- Prepare support process
- Prepare merchant training script
- Confirm first pilot merchants

### Shared outputs

- MVP v1
- Internal QA report
- Admin panel v1
- Dashboard v1
- Pilot launch plan
- Merchant onboarding calendar
- Support SOP v1

### Month 7 decision gate

Proceed if:

- MVP v1 can capture and structure events
- Dashboard and admin panel are usable
- KPI tracking is functional
- Pilot launch materials are ready

## Month 8 — Q1

## Pilot Launch Preparation and First Merchant Onboarding

### Main objective

Prepare and begin controlled pilot onboarding.

### Asim tasks

- Lead pilot launch review
- Confirm pilot KPI targets
- Track budget and risk
- Prepare weekly pilot reporting structure
- Review partner/compliance dependencies
- Coordinate escalation process

### Fred tasks

- Fix MVP bugs
- Monitor transaction capture quality
- Monitor dashboard/admin issues
- Improve onboarding flow based on field feedback
- Prepare technical support process
- Track system health

### Berk tasks

- Onboard first pilot merchants
- Measure setup time
- Support first test transactions
- Collect onboarding feedback
- Run Day 1 check-ins
- Update merchant CRM
- Track activation status

### Shared outputs

- First onboarded merchants
- Setup time data
- Activation data
- Bug list
- Field feedback report
- Updated onboarding SOP

### Month 8 decision gate

Proceed if:

- First merchants can be onboarded
- Setup process is measurable
- Product issues are manageable
- Merchant feedback is being collected

---

## Month 9 — Q1

## Pilot Execution and KPI Measurement

### Main objective

Run the pilot with activated merchants and measure whether the product creates real value.

### Asim tasks

- Review weekly KPI data
- Prepare pilot KPI report v1
- Review support burden
- Review budget use
- Lead decision meetings
- Identify whether scope should be adjusted

### Fred tasks

- Monitor capture quality
- Monitor payout matching
- Monitor exception logic
- Fix critical bugs
- Improve dashboard based on feedback
- Maintain admin panel
- Export product analytics

### Berk tasks

- Continue merchant onboarding
- Track active merchants
- Run Day 3 and Day 7 check-ins
- Collect payout clarity feedback
- Collect objections from inactive merchants
- Document testimonials and quotes
- Support merchant retention

### Shared outputs

- Activated pilot cohort
- Weekly KPI report
- Capture quality report
- Support burden report
- Merchant feedback summary
- Iteration backlog

### Month 9 decision gate

Revise if:

- Activation is below 60%
- Capture quality is below 95%
- Setup time is above 20 minutes
- Support burden is too high
- Merchant value is unclear

Proceed if:

- Product is usable
- Merchants understand value
- KPI signals are within acceptable range

---

## Month 10 — Q2

## Product Iteration and Retention

### Main objective

Improve the MVP based on pilot data and focus on repeat usage.

### Asim tasks

- Analyze KPI trends
- Prepare business model learning notes
- Update pricing assumptions
- Review unit economics assumptions
- Prepare decision memo: continue, narrow, expand, or pivot
- Coordinate advisor feedback

### Fred tasks

- Implement high-priority product fixes
- Improve dashboard clarity
- Improve payout visibility
- Improve exception signal logic
- Improve admin panel reporting
- Prepare technical hardening list

### Berk tasks

- Run retention check-ins
- Identify why merchants continue or stop using the product
- Collect merchant satisfaction scores
- Prepare case study candidates
- Test referral message
- Refine GTM script

### Shared outputs

- Product iteration backlog completed
- Retention analysis
- Merchant satisfaction results
- Pricing learning notes
- Updated GTM script
- KPI report v2

### Month 10 decision gate

Proceed if:

- Repeat usage is above or approaching 50%
- Merchants understand payout visibility
- Support burden is manageable
- Product improvements are clear

---

## Month 11 — Q2

## Pilot Consolidation and Rollout Playbook

### Main objective

Turn pilot learning into a repeatable operating model.

### Asim tasks

- Draft pilot report
- Prepare financing/investor narrative
- Prepare budget use summary
- Prepare incorporation readiness checklist
- Analyze city-level differences
- Prepare final risk summary

### Fred tasks

- Prepare technical documentation
- Prepare technical hardening plan
- Document architecture
- Document data schema
- Document admin/dashboard logic
- Prepare post-MVP product roadmap

### Berk tasks

- Prepare GTM playbook
- Prepare merchant case studies
- Prepare testimonial list
- Prepare onboarding playbook
- Prepare referral process
- Prepare city-cluster rollout notes

### Shared outputs

- Pilot report draft
- GTM playbook v1
- Technical documentation v1
- Case studies
- Rollout playbook
- Financing narrative draft

### Month 11 decision gate

Proceed if:

- Pilot learning is documented
- Case studies exist
- Technical roadmap is clear
- GTM playbook is repeatable

---

## Month 12 — Q2

## Final Internal Report and Next-Stage Plan

### Main objective

Complete the internal project report and define the next stage for MCBuse.

### Asim tasks

- Finalize internal execution report
- Finalize budget report
- Finalize KPI report
- Finalize financing package
- Finalize incorporation roadmap
- Prepare next 6–12 month operating plan

### Fred tasks

- Finalize technical documentation
- Finalize product roadmap
- Finalize security and data documentation
- Prepare technical handover materials
- Prepare future integration requirements

### Berk tasks

- Finalize GTM playbook
- Finalize merchant success playbook
- Finalize outreach scripts
- Finalize case studies
- Finalize merchant feedback report
- Prepare next-city or next-cluster recommendation

### Shared outputs

- Final internal execution report
- Final KPI dashboard
- Final pilot report
- Final technical documentation
- Final GTM playbook
- Final budget use summary
- Post-EXIST operating plan
- Financing and incorporation package

### Month 12 decision gate

The team decides:

- Continue with current MVP direction
- Narrow the ICP
- Expand pilot merchants
- Seek external financing
- Formalize incorporation
- Start partner-led scale-up
- Prepare next city or deeper Munich/Berlin rollout

---

# 14. Weekly Sprint Template

The team should work in weekly sprints.

## Weekly sprint table

| Week | Task | Owner | Support | Output | Deadline | Status |
| --- | --- | --- | --- | --- | --- | --- |
| W1 | Create project board | Asim | Berk | Notion/Trello board | Friday | Not started |
| W1 | Review sandbox demo | Fred | Asim | Demo audit note | Friday | Not started |
| W1 | Build merchant CRM template | Berk | Asim | Merchant database sheet | Friday | Not started |
| W2 | Define MVP scope | Asim | Fred | MVP scope v1 | Friday | Not started |
| W2 | Draft transaction event schema | Fred | Asim | Event schema v1 | Friday | Not started |
| W2 | Prepare interview script | Berk | Asim | Interview guide | Friday | Not started |

## Weekly individual update format

Each person should answer these questions before the weekly team meeting:

1. What did I complete this week?
2. What is still in progress?
3. What is blocked?
4. What do I need from the team?
5. What will I deliver next week?
6. Is any deadline at risk?

---

# 15. Work Packages

## WP1 — Project Management and KPI Governance

**Owner:** Asim

**Timeline:** Month 1–12

### Tasks

- Project board
- Monthly milestone tracking
- KPI dashboard
- Budget tracker
- Risk register
- Decision log
- Monthly reports
- Final internal report

### Deliverables

- Project management system
- Monthly KPI reports
- Budget updates
- Risk updates
- Decision gate documentation

---

## WP2 — MVP Architecture and Development

**Owner:** Fred

**Timeline:** Month 1–9

### Tasks

- Demo audit
- Architecture definition
- Event schema
- Merchant onboarding flow
- QR/NFC capture
- Payout matching
- Exception logic
- Dashboard
- Admin panel
- KPI tracking
- Secure storage
- Technical documentation

### Deliverables

- MVP architecture
- Product backlog
- MVP v1
- Dashboard v1
- Admin panel v1
- Technical documentation

---

## WP3 — Merchant Discovery and Validation

**Owner:** Berk

**Timeline:** Month 2–8

### Tasks

- Merchant list building
- Interview guide
- Field interviews
- ICP refinement
- Objection library
- Pitch testing
- Pilot-intent collection
- Merchant feedback documentation

### Deliverables

- Merchant CRM
- Interview notes
- ICP v2
- Objection library
- Pilot-intent list
- Feedback summary

---

## WP4 — Partner and Compliance Readiness

**Owner:** Asim

**Support:** Fred

**Timeline:** Month 2–8

### Tasks

- Partner shortlist
- Legal question list
- Compliance boundary memo
- Privacy and data questions
- Partner-ready integration discussion
- Demo material preparation for partners

### Deliverables

- Partner shortlist
- Compliance boundary memo
- Partner discussion notes
- Legal/compliance checklist

## WP5 — Pilot Execution

**Owner:** Berk

**Support:** Fred and Asim

**Timeline:** Month 8–10

### Tasks

- Merchant onboarding
- Setup time tracking
- First transaction support
- Day 1 / Day 3 / Day 7 check-ins
- Support issue tracking
- Feedback collection
- Activation tracking

### Deliverables

- Activated pilot cohort
- Setup time data
- Support log
- Merchant feedback
- Pilot KPI report

---

## WP6 — Product Iteration and KPI Learning

**Owner:** Fred

**Support:** Asim and Berk

**Timeline:** Month 9–11

### Tasks

- Analyze capture quality
- Analyze payout matching
- Analyze dashboard usage
- Fix product issues
- Improve onboarding
- Improve exception logic
- Improve admin visibility

### Deliverables

- Product iteration backlog
- Updated MVP
- KPI learning notes
- Technical hardening plan

---

## WP7 — GTM and Rollout Playbook

**Owner:** Berk

**Support:** Asim

**Timeline:** Month 4–12

### Tasks

- Sales script
- Objection handling
- Merchant onboarding playbook
- City-cluster strategy
- Referral process
- Case studies
- Testimonials
- Local positioning

### Deliverables

- GTM playbook
- Onboarding playbook
- Merchant success playbook
- Case studies
- Referral strategy

---

## WP8 — Financing and Incorporation Readiness

**Owner:** Asim

**Timeline:** Month 10–12

### Tasks

- Pilot evidence summary
- KPI narrative
- Budget use summary
- Business model validation
- Financing narrative
- Incorporation checklist
- Next-stage roadmap

### Deliverables

- Financing package
- Incorporation roadmap
- Final business case
- Post-project operating plan

---

# 16. Marketing and GTM Execution Plan

## 16.1 Berk’s 6-Week Marketing Development Track

During the early project phase, Berk should follow a structured marketing development path to become fully effective in customer discovery, GTM, and growth execution.

### Week 1 — Startup Marketing Fundamentals

Outputs:

- Funnel draft
- Value proposition
- Two customer personas
- Competitor/alternative list
- 15-second, 45-second, and 2-minute pitch
- One-page startup marketing snapshot

### Week 2 — Digital Channels and Measurement

Outputs:

- North Star Metric
- Supporting KPIs
- Measurement plan
- Landing page wireframe/copy
- Content ideas
- Channel priority list
- First campaign concept

### Week 3 — Strategy, SWOT and GTM

Outputs:

- SWOT v1
- TOWS action list
- Competitor comparison
- ICP v1
- GTM plan v1
- Objection list
- Prioritized marketing backlog

### Week 4 — Growth Experiments and Analytics

Outputs:

- Experiment template
- A/B test ideas
- Event tracking list
- Dashboard metric definitions
- Onboarding friction analysis
- Retention ideas
- Main experiment plan

### Week 5 — Execution

Outputs:

- Landing page copy v1
- Creative angles
- Distribution schedule
- Campaign checklist
- First content draft
- Iteration backlog

### Week 6 — Reporting and Role Clarification

Outputs:

- Executive summary
- Marketing workflow board
- QA checklists
- Second experiment plan
- Personal development gap analysis
- Final 5-slide presentation
- Weekly responsibilities and KPI ownership

---

# 17. Munich and Berlin Pilot Strategy

## 17.1 Overall Approach

The team should use a cluster-first rollout strategy instead of spreading too thin across both cities.

This means:

- Focus on 2–3 neighborhoods per city
- Build visible density
- Use merchant referrals
- Keep onboarding close and founder-led
- Track every conversation and activation
- Expand only after KPI gates are met

## 17.2 Berlin Focus

Berlin should be used for fast learning because of its density of kiosks, Spätis, cafés, small shops, food/takeaway merchants, and strong cashless payment discussion.

Potential target merchant types:

- Spätis
- Kiosks
- Convenience stores
- Small cafés
- Bakeries
- Takeaway shops
- Food trucks
- Pop-ups
- Small groceries

## 17.3 Munich Focus

Munich should be used for high purchasing power, tourist flow, commuters, and dense central areas where digital payment expectations are high.

Potential priority clusters:

1. Glockenbachviertel / Gärtnerplatz
2. Maxvorstadt
3. Altstadt-Lehel and central transit edges

Munich-specific pitch:

“Many customers expect contactless payment, especially tourists and commuters. Minimums and cash-only rules can cause lost sales during peak times. We help small merchants accept low-ticket digital payments with transparent fees, predictable payouts, and fast setup.”

## 17.4 Base Pilot Distribution

| City | Signed Pilot Target | Activated Merchant Target |
| --- | --- | --- |
| Munich | 15–20 | 10–12 |
| Berlin | 15–20 | 10–12 |
| **Total** | **30–40** | **20–25** |

---

# 18. Merchant Onboarding Workflow

## 18.1 Target Setup Time

The target onboarding time is below 20 minutes. The stretch target is below 15 minutes.

## 18.2 Onboarding Steps

1. Merchant profile creation
2. Consent capture
3. Partner-approved KYB step, if required
4. App/demo/system access setup
5. QR/NFC activation
6. Test transaction
7. Dashboard explanation
8. Payout visibility explanation
9. Support channel setup
10. Sticker / quick-start material handover

## 18.3 Merchant Success Sequence

### Day 1

- Confirm setup
- Confirm first test transaction
- Ask if anything was confusing
- Record setup time
- Record first impression

### Day 3

- Check whether merchant used the system
- Ask about customer reaction
- Ask about dashboard clarity
- Log issues

### Day 7

- Confirm payout clarity
- Ask if merchant trusts the system
- Ask if merchant would continue
- Ask if merchant would recommend another merchant

### Day 30

- Measure repeat usage
- Collect satisfaction score
- Ask for testimonial
- Identify retention risk

---

# 19. Decision Gates

## Gate 1 — End of Month 3

Question: Is the MVP scope clear?

Proceed if:

- Scope is frozen
- Event schema exists
- Compliance boundaries are documented
- Demo learning is captured
- First merchant feedback exists

## Gate 2 — End of Month 6

Question: Are we ready to build and launch pilot?

Proceed if:

- Pilot cohort shortlist exists
- Onboarding prototype is ready
- Dashboard prototype is understandable
- Product backlog is prioritized
- Partner/legal assumptions are clear

## Gate 3 — End of Month 9

Question: Is the pilot working?

Proceed if:

- Activation is above 60%
- Capture quality is above 95%
- Setup time is below 20 minutes
- Merchants understand payout visibility
- Support burden is manageable

Revise if:

- Merchants do not activate
- Setup is too complex
- Data quality is weak
- Product value is unclear

## Gate 4 — End of Month 12

Question: Is MCBuse ready for the next stage?

Proceed if:

- Repeat usage is above 50%
- Payout clarity score is at least 4/5
- Pilot report is complete
- Rollout playbook exists
- Technical roadmap is clear
- Financing/incorporation package is ready

---

# 20. Risk Register

| Risk | Owner | Impact | Mitigation |
| --- | --- | --- | --- |
| Partner access is delayed | Asim | Live payment/payout data may be limited | Maintain sandbox/demo fallback and partner-ready architecture |
| MVP scope becomes too broad | Asim + Fred | Delays and confusion | Use scope freeze and out-of-scope list |
| Setup takes too long | Berk + Fred | Activation drops | Simplify onboarding and use assisted setup |
| Capture quality is low | Fred | Product value weakens | Improve event schema, matching rules and QA |
| Merchant distrust remains high | Berk | Pilot adoption slows | Use transparent payout messaging and human support |
| Compliance boundaries unclear | Asim | Regulatory risk | Use legal/compliance coaching and licensed partner structures |
| Support burden too high | Berk | Scaling becomes difficult | Build SOPs, FAQ and escalation system |
| Stablecoin narrative creates confusion | Asim | The wedge and future platform may be mistaken for one oversized product | Lead with stablecoin payment → merchant data → analytics and readiness; label the multi-issuer platform as long-term |
| Budget is used too early | Asim | Later pilot activities suffer | Monthly budget control and spending approval rules |
| Team workload becomes unbalanced | Asim | Execution slows | Weekly sprint review and task redistribution |

---

# 21. Internal Documentation Structure

The team should create one shared folder with the following structure:

1. 00_Project_Management
2. 01_Idea_Paper_and_Strategy
3. 02_Product_and_Tech
4. 03_Demo_and_Sandbox
5. 04_Merchant_Discovery
6. 05_GTM_and_Marketing
7. 06_Pilot_Operations
8. 07_KPI_and_Reports
9. 08_Budget_and_Finance
10. 09_Partner_and_Legal
11. 10_Final_Report_and_Next_Stage

Each output must be saved in the correct folder.

---

# 22. Task Ownership Rules

1. Every task has one owner.
2. The owner is responsible for delivery, even if others support.
3. Tasks without deadlines are not valid tasks.
4. Tasks without outputs are not valid tasks.
5. If a task is blocked, the owner must flag it before the weekly meeting.
6. If a task is late, the owner must explain why and propose a new deadline.
7. No major scope change should happen without team agreement.
8. Every major decision must be written in the decision log.

---

# 23. Weekly Team Dashboard

The team should review the following dashboard every week:

| Area | Question | Owner |
| --- | --- | --- |
| Product | What was built or improved this week? | Fred |
| Marketing | How many merchants were contacted or interviewed? | Berk |
| Pilot | How many merchants are interested, signed or active? | Berk |
| KPI | Are we moving toward the monthly targets? | Asim |
| Budget | Did we spend anything? Is it documented? | Asim |
| Risks | What is blocked or risky? | Asim |
| Decisions | What decision must be made this week? | Asim |

---

# 24. Final Expected Outcomes After 12 Months

By the end of the 12-month period, MCBuse should have:

1. A working partner-ready Data-Capture MVP
2. A tested onboarding workflow
3. A structured transaction event schema
4. A merchant dashboard
5. An internal admin panel
6. Payout-status matching logic
7. Exception flagging logic
8. KPI tracking process
9. Pilot evidence from Munich and Berlin
10. A documented pilot report
11. A GTM and rollout playbook
12. A support and onboarding playbook
13. Technical documentation
14. Budget use summary
15. Financing and incorporation readiness materials
16. Clear decision on the next stage

---

# 25. Immediate Next Steps

The team should begin with the following first actions.

## First 7 days

### Asim

- Create shared project board
- Create folder structure
- Create budget tracker
- Create KPI dashboard template
- Create weekly meeting format
- Write project charter v1

### Fred

- Review sandbox demo
- Write demo audit note
- Create technical backlog
- Draft event schema v1
- List technical risks
- Define architecture questions

### Berk

- Create merchant CRM sheet
- Build first 50 merchant prospect list
- Draft interview script
- Draft 30-second pitch
- Prepare objection library structure
- Review first target clusters

## First 30 days

### Asim

- Finalize project charter
- Finalize responsibility matrix
- Prepare partner/legal question list
- Prepare first monthly status report

### Fred

- Finalize event schema v1
- Finalize architecture v1
- Prepare MVP requirements document
- Prepare dashboard/admin panel outline

### Berk

- Conduct first merchant conversations
- Refine ICP
- Update pitch scripts
- Build objection library v1
- Prepare merchant discovery report v1

---

# 26. Team Principle

The team should follow one execution principle throughout the project:

**Build only what helps us validate the Data-Capture MVP with real low-ticket merchants.**

Every task should connect to one of the following:

- MVP readiness
- Merchant validation
- Pilot activation
- Data quality
- Payout visibility
- Compliance safety
- Repeatable rollout
- Financing readiness

If a task does not support one of these, it should be delayed or removed.
