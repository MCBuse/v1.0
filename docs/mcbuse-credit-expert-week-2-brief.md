# MCBuse Credit Expert Brief - Hackathon Week 2

## About MCBuse

MCBuse is a merchant data and financial intelligence company. We help under-documented merchants turn their payment activity into clear business records, useful financial insights, and evidence they can share with a lender.

For the hackathon, we are using verified merchant payments to demonstrate how everyday transaction history can help a merchant become ready for a credit assessment.

## Your Week 2 Objective

Help us prepare for future credit-risk modelling by deciding which simple and explainable indicators can be produced from merchant payment history, and what additional information a validated model would require.

## What You Will Work On

1. Review the sample merchant payment data and confirm what it can and cannot tell us.
2. Identify useful indicators, such as transaction frequency, sales consistency, active business days, average transaction value, sales trends, and unusual changes.
3. Recommend simple criteria for showing whether a merchant has enough reliable history to be assessed by a lender.
4. List any important data that is missing and explain why it would be needed.
5. Build a small analytical prototype using the supplied synthetic data to demonstrate how the indicators could be calculated and explained.

## What We Will Give You

We will provide the following product context, data, and existing rules:

- **Product context:** MCBuse serves small, under-documented merchants whose business activity may not be visible to formal lenders. We record verified payments and turn them into a merchant financial history.
- **Merchant payment data:** The included [synthetic transaction sample](./sample-data/mcbuse-credit-expert-transactions-sample.csv) contains anonymous merchant and transaction IDs; payment and settlement amounts and currencies; payment status; transaction dates; payment-attempt status and error codes; and capture exceptions.
- **Data-quality records:** Capture exceptions with their reason, severity, status, retry count, and resolution date, together with the merchant's evidence-sharing consent status.
- **Existing indicators:** The included [synthetic readiness sample](./sample-data/mcbuse-credit-expert-readiness-sample.csv) provides observed days, active sales days, finalized payment count, verified sales, average sale, capture quality, payment finality, active consent, unresolved critical exceptions, and the expected readiness stage.
- **Technical context:** The hackathon payment flow uses USDC over Solana. Monetary values are stored as integer minor units to prevent rounding errors.

Our current hackathon rules place a merchant into one of four stages:

- **Integrity review:** an unresolved critical exception exists.
- **Insufficient evidence:** fewer than 7 observed days or fewer than 5 finalized payments.
- **Building history:** some valid history exists, but the evidence-ready requirements have not all been met.
- **Evidence ready:** at least 30 observed days, 10 active days, 25 finalized payments, 98% capture quality, 98% finality, active consent, and no unresolved critical exception.

### Current Data Limits

These are demonstration rules and have not been validated as lending criteria. We do not currently have verified loan applications, loan amounts, repayment histories, defaults, expenses, profit, existing debt, or complete business cash-flow data. The current data can support descriptive analytics and an evidence-readiness prototype, but it cannot validate a predictive credit-risk model. We need your advice on the minimum additional data required for that future work.

An MCBuse engineer will explain the export and support any questions about the data or product calculations.

## Sample Data Preview

The sample data is synthetic and is provided to explain the structure and test the readiness logic. It is not evidence of real merchant performance.

| Merchant | Observed days | Active days | Finalized payments | Verified sales | Capture quality | Finality | Critical issue | Expected stage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `merchant_ready_001` | 35 | 12 | 30 | EUR 2,584.00 | 99.2% | 99.0% | No | Evidence ready |
| `merchant_building_002` | 18 | 6 | 14 | EUR 982.00 | 99.0% | 97.5% | No | Building history |
| `merchant_insufficient_003` | 5 | 3 | 4 | EUR 216.00 | 100.0% | 100.0% | No | Insufficient evidence |
| `merchant_review_004` | 22 | 8 | 20 | EUR 1,465.00 | 92.0% | 96.0% | Yes | Integrity review |

### How to Read the Files

- `display_amount_minor` records the merchant-facing amount in cents. For example, `6500` means EUR 65.00.
- `settlement_amount_atomic` records USDC in its smallest unit. For example, `71000000` means 71 USDC.
- `payment_status` shows whether a verified merchant transaction was created.
- `attempt_status` and `error_code` describe the result of the payment attempt.
- `exception_reason`, `exception_severity`, and `exception_status` identify data-quality problems that may require review.
- `data_source` identifies every supplied record as synthetic demonstration data.

The transaction file is a small extract that demonstrates the record format and exception cases. The readiness file contains full-history summary examples, so its payment counts are larger than the number of rows in the transaction extract.

## What We Need From You by the End of Week 2

- A short list of the recommended indicators.
- A simple explanation of how each indicator should be calculated and interpreted.
- Recommended readiness criteria that we can explain clearly to merchants and lenders.
- A list of missing data needed for stronger analysis or future machine-learning work.
- Any prototype, calculations, or supporting notes produced during the work.

## Important Boundary

This work should help a lender understand a merchant's verified business activity and whether enough evidence exists for an assessment. It should not approve or reject a loan, recommend a loan amount, set an interest rate, or present an untested model as a credit score. Final credit decisions remain with the lender.
