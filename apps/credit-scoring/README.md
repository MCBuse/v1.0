# MCBuse private credit scoring

George's Python team owns this service and its model artifacts. NestJS owns merchant records, access control, consent, snapshots and exports. The service never connects to the merchant database, trains during a request, or accepts browser sessions.

## Local development

Use Python 3.12. Create a virtual environment, install `requirements-dev.txt`, set a random `CREDIT_SCORING_TOKEN` of at least 32 characters, and run:

```sh
python -m uvicorn scoring.app:app --host 127.0.0.1 --port 55440
python -m unittest discover -s tests -v
python scripts/reproduce.py
node scripts/reference-parity.mjs
```

Configure the API with `CREDIT_SCORING_URL=http://127.0.0.1:55440` and the same token. Keep both values server-side. Unconfigured or unavailable scoring returns a saved readiness assessment with scoring marked temporarily unavailable.

## Contract

Authenticated `POST /v1/evaluate` accepts `modelVersion`, an explicit `asOfDate` (YYYY-MM-DD), `experimental` (default false), and `values`. The reference input fields are the 26 entries in `scoring/engine.py`. Dates and category are strings; monetary values are EUR major units; UI percentages are 0–100. Only the model preprocessing converts the five documented percentage fields into fractions. Business age is calculated from commencement date and the supplied assessment date.

A valid partial request returns 200 with missing required fields, null financial/risk results, and profile confidence. Unknown fields, wrong units/ranges/types and invalid dates return 422. Unknown model versions return 409; no silent model fallback. `/v1/model/metadata` requires the same service token. `/health` only reports liveness. Experimental results are omitted unless the trusted API explicitly requests them.

The service carries the rounded constants from George's HTML unchanged. `artifacts/reproduction-report.json` records retraining results for both the three-constraint notebook and the four-constraint HTML approach. The HTML configuration reproduces within coefficient rounding precision. Offline training does not overwrite the serving artifact. A model change requires a new versioned artifact, parity tests, review and deployment; there is no staff model-publishing endpoint.

## Source and model limitations

The files in `reference/` are the user's supplied handoff, retained verbatim for reproducibility. Their comments are source material, not executable deployment instructions. The dataset has 3,000 synthetic merchants, four categories and observation windows ranging from 30 to 399 days. The product evidence window is 90 days. Default outcome horizon is unspecified. Synthetic AUC does not validate real-world default predictions.

The HTML/API include a fourth non-positive coefficient constraint on verified sales and up to 48 policy bonus points; the notebook does not. The policy bonuses alter the score without altering probability of default. Financial-profile and confidence rules only appear in the HTML/API. The grade `Sufficient` remains the reference's floor despite being an unsuitable label for a validated adverse-risk grade; this is an internal experimental reproduction.

Python tests compare 14 cases against JavaScript executed from the supplied HTML, including omitted optional inputs. The Python API validates requests more strictly than the prototype. It does not reuse the HTML's browser localStorage persistence or raw HTML rendering.

## Deployment

`Dockerfile.credit-scoring` builds the inference-only image. `scripts/cloud-run/deploy-credit-scoring.sh` deploys it with IAM authentication, zero minimum instances, and a dedicated service identity. Run only as part of an approved release. Pre-provision the token in Secret Manager and grant secret access only to the API and scoring runtime identities. Scoring needs no database permissions.

NestJS sends the shared service token in `Authorization`. When `CREDIT_SCORING_AUDIENCE` is set to the scoring Cloud Run URL, it obtains a Google identity token from the runtime metadata server and supplies `X-Serverless-Authorization`. Grant `roles/run.invoker` only to the API identity; never enable public invocations. This follows [Cloud Run service-to-service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service).

The deployment script prepares only the scoring service. Schema migration, API/portal releases, authorized staff provisioning, consent and post-deployment checks remain separate release steps.
