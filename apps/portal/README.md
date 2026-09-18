# MCBuse Merchant Portal

Runs locally on `http://localhost:3001` and connects to the deployed API through server-side route handlers.

Required configuration:

```text
MCBUSE_API_URL=https://mcbuse-api-332810840225.europe-west1.run.app/api/v1
PORTAL_ORIGIN=http://localhost:3001
PORTAL_ORIGINS=
NEXT_PUBLIC_AUTH_BACKGROUND_URL=
SESSION_COOKIE_SECURE=false
```

`MCBUSE_API_URL` is server-only. Access and refresh tokens are stored in HTTP-only cookies and are never exposed to browser JavaScript.

The deployed hackathon portal is a separate Cloud Run service:

```text
https://mcbuse-portal-332810840225.europe-west1.run.app
```

The canonical merchant URL is `https://merchant.mcbuse.com`, while the Cloud
Run URL remains an allowed origin for direct access. In production, set
`PORTAL_ORIGIN` to the canonical URL and use the comma-separated
`PORTAL_ORIGINS` allowlist for both HTTPS origins. The portal API may use
`https://api.mcbuse.com/api/v1`; the Cloud Run API URL remains available.

Deploy it from the repository root with:

```text
pnpm deploy:portal:cloud-run
```

The deploy script defaults to the dedicated `mcbuse-hackathon-2026-fno`
project. Run `gcloud auth login` once if the Google Cloud CLI has no active
account. `MCBUSE_GCP_PROJECT_ID` remains available as an explicit override.

The portal runtime receives no database, JWT, Stripe, or wallet secret. Its only runtime configuration is the server-only API URL, canonical portal origin, secure-cookie enforcement, and the optional public authentication background URL.

The configured service is the dedicated MCBuse Cloud Run deployment in the
`mcbuse-hackathon-2026-fno` Google Cloud project. Do not point the portal at an
unrelated Google Cloud project.
