# Stripe Setup for Topup/Onramp Feature

## Problem
The topup feature returns a 500 error because `STRIPE_SECRET_KEY` is set to a placeholder value.

## Quick Fix

### Option 1: Get Real Stripe Test Credentials (Recommended for Testing)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/register)
2. Create a free account (no credit card required for test mode)
3. Navigate to **Developers → API keys**
4. Copy the **Secret key** (starts with `sk_test_...`)
5. Update your `.env` file:
   ```bash
   STRIPE_SECRET_KEY=sk_test_YOUR_ACTUAL_KEY_HERE
   ```
6. Restart the API server:
   ```bash
   cd apps/api
   pnpm start:dev
   ```

### Option 2: Disable Widget Sessions (Quick Workaround)

If you don't need the widget-based topup flow, you can:

1. Use the direct onramp endpoint instead:
   - Endpoint: `POST /api/v1/onramp` (not `/onramp/sessions`)
   - This uses the `ONRAMP_PROVIDER` setting which can be set to `mock`

2. Update mobile app to use the direct endpoint (temporary workaround)

## Testing with Stripe

Once you have a real test key:

1. Use test card numbers from [Stripe Testing](https://stripe.com/docs/testing):
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - Use any future expiry date and any 3-digit CVC

## Additional Environment Variables

For full Stripe integration, you may also need:

```bash
STRIPE_WEBHOOK_SECRET=whsec_... # Get from Stripe Dashboard → Webhooks
STRIPE_CRYPTO_ONRAMP_ENABLED=false # Set to true if using Stripe Crypto Onramp
```

## Verification

After updating your Stripe key, the API will start successfully and you should see no warnings about placeholder keys.

Test the endpoint:
```bash
curl -X POST http://localhost:4000/api/v1/onramp/sessions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider":"stripe","fiatAmount":"50","fiatCurrency":"USD"}'
```

You should get a response with a `widgetUrl` instead of a 500 error.
