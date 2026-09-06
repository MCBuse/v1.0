# MCBuse Merchant Portal

Runs locally on `http://localhost:3001` and connects to the deployed API through server-side route handlers.

Required configuration:

```text
MCBUSE_API_URL=https://mcbuse-api.fly.dev/api/v1
PORTAL_ORIGIN=http://localhost:3001
NEXT_PUBLIC_AUTH_BACKGROUND_URL=
SESSION_COOKIE_SECURE=false
```

`MCBUSE_API_URL` is server-only. Access and refresh tokens are stored in HTTP-only cookies and are never exposed to browser JavaScript.
