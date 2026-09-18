import { execFileSync } from 'node:child_process';
import process from 'node:process';

const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const STRIPE_WEBHOOK_PATHS = new Set([
  '/api/v1/onramp/webhooks/stripe',
  '/api/v1/webhooks/stripe',
]);

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function runGcloud(args) {
  return execFileSync('gcloud', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function readSecret(projectId, name) {
  return runGcloud([
    'secrets',
    'versions',
    'access',
    'latest',
    `--secret=${name}`,
    `--project=${projectId}`,
  ]);
}

function environment(container) {
  return new Map(
    (container?.env ?? [])
      .filter((entry) => typeof entry?.name === 'string')
      .map((entry) => [entry.name, entry.value]),
  );
}

function publicServiceUrls(service) {
  const raw = service?.metadata?.annotations?.['run.googleapis.com/urls'];
  try {
    const urls = JSON.parse(raw ?? '[]');
    if (Array.isArray(urls) && urls.every((url) => typeof url === 'string')) {
      return urls;
    }
  } catch {
    // Fall back to the single service status URL on older Cloud Run responses.
  }
  return typeof service?.status?.url === 'string' ? [service.status.url] : [];
}

async function readJson(response, label) {
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function main() {
  const projectId = process.env.MCBUSE_GCP_PROJECT_ID?.trim();
  const region = process.env.MCBUSE_GCP_REGION?.trim() || 'europe-west1';
  const serviceName = argument('service') || 'mcbuse-api';
  const apiBaseUrl = argument('api-base-url');

  if (!projectId || !apiBaseUrl) {
    throw new Error(
      'Usage: MCBUSE_GCP_PROJECT_ID=... pnpm --filter api merchant:hosted-infra-readiness -- --api-base-url https://service.run.app/api/v1',
    );
  }

  const apiBase = new URL(apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`);
  if (apiBase.protocol !== 'https:' || apiBase.hostname === 'localhost') {
    throw new Error('api-base-url must be the hosted HTTPS API base URL');
  }

  const service = JSON.parse(
    runGcloud([
      'run',
      'services',
      'describe',
      serviceName,
      `--project=${projectId}`,
      `--region=${region}`,
      '--format=json',
    ]),
  );
  const container = service?.spec?.template?.spec?.containers?.[0];
  const env = environment(container);
  const latestReadyRevision = service?.status?.latestReadyRevisionName ?? null;
  const latestTraffic = (service?.status?.traffic ?? []).some(
    (entry) =>
      entry?.revisionName === latestReadyRevision && Number(entry?.percent) === 100,
  );

  const stripeKey = readSecret(projectId, 'STRIPE_SECRET_KEY');
  const stripeWebhookSecret = readSecret(projectId, 'STRIPE_WEBHOOK_SECRET');
  const stripeMode = stripeKey.startsWith('sk_test_')
    ? 'test'
    : stripeKey.startsWith('sk_live_')
      ? 'live'
      : 'unknown';

  const authorization = Buffer.from(`${stripeKey}:`).toString('base64');
  const stripeResponse = await fetch(
    'https://api.stripe.com/v1/webhook_endpoints?limit=100',
    { headers: { authorization: `Basic ${authorization}` } },
  );
  const stripePayload = await readJson(stripeResponse, 'Stripe webhook lookup');
  const endpoints = Array.isArray(stripePayload?.data) ? stripePayload.data : [];
  const relevantEnabled = endpoints.filter((endpoint) => {
    if (endpoint?.status !== 'enabled' || typeof endpoint?.url !== 'string') {
      return false;
    }
    try {
      return STRIPE_WEBHOOK_PATHS.has(new URL(endpoint.url).pathname);
    } catch {
      return false;
    }
  });
  const cloudRunApiBases = publicServiceUrls(service).map(
    (url) => new URL('api/v1/', `${url}/`),
  );
  const expectedWebhookUrls = new Set(
    [apiBase, ...cloudRunApiBases]
      .map((base) => new URL('onramp/webhooks/stripe', base).toString()),
  );
  const oneExpectedStripeWebhook =
    relevantEnabled.length === 1 &&
    expectedWebhookUrls.has(relevantEnabled[0]?.url) &&
    relevantEnabled[0]?.livemode === false &&
    (relevantEnabled[0]?.enabled_events?.includes('*') ||
      relevantEnabled[0]?.enabled_events?.includes(
        'checkout.session.completed',
      ));

  const healthResponse = await fetch(new URL('health', apiBase));
  const health = await readJson(healthResponse, 'API health check');
  const healthReady =
    health?.status === 'ok' && health?.services?.database === 'ok';

  const checks = {
    latestRevisionHasAllTraffic: latestTraffic,
    merchantPortalEnabled: env.get('MERCHANT_PORTAL_ENABLED') === 'true',
    transfersRemainMocked: env.get('TRANSFER_PROVIDER') === 'mock',
    solanaUsesDevnet: env.get('SOLANA_NETWORK') === 'devnet',
    devnetUsdcMintConfigured: env.get('SOLANA_USDC_MINT') === DEVNET_USDC_MINT,
    stripeUsesTestMode: stripeMode === 'test',
    stripeWebhookSecretConfigured: stripeWebhookSecret.length > 0,
    exactlyOneCloudRunCheckoutWebhook: oneExpectedStripeWebhook,
    apiAndDatabaseHealthy: healthReady,
  };
  const ready = Object.values(checks).every(Boolean);

  process.stdout.write(
    `${JSON.stringify(
      {
        projectId,
        region,
        service: serviceName,
        latestReadyRevision,
        expectedWebhookHost: apiBase.hostname,
        acceptedWebhookHosts: [...expectedWebhookUrls].map(
          (url) => new URL(url).hostname,
        ),
        activeStripeWebhookHost:
          typeof relevantEnabled[0]?.url === 'string'
            ? new URL(relevantEnabled[0].url).hostname
            : null,
        stripeMode,
        activeRelevantStripeWebhooks: relevantEnabled.length,
        checks,
        ready,
      },
      null,
      2,
    )}\n`,
  );
  if (!ready) process.exitCode = 2;
}

void main().catch((error) => {
  const message =
    error instanceof Error ? error.message : 'Hosted readiness check failed';
  process.stderr.write(`${message.replaceAll(/sk_(?:test|live)_[^\s]+/g, '[stripe-key-redacted]')}\n`);
  process.exitCode = 1;
});
