import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

type StripeInstance = Stripe.Stripe;

@Injectable()
export class StripeClient {
  readonly stripe: StripeInstance;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.getOrThrow<string>('STRIPE_SECRET_KEY');

    // Warn if using placeholder key
    if (secretKey === 'sk_test_replace_me' || secretKey.includes('replace_me')) {
      console.warn(
        '\n⚠️  STRIPE_SECRET_KEY is set to a placeholder value.\n' +
        '   Get a real test key from: https://dashboard.stripe.com/test/apikeys\n' +
        '   Stripe API calls will fail until you update this.\n'
      );
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-04-22.dahlia',
      typescript: true,
      appInfo: {
        name: 'mcbuse-api',
        version: '0.1.0',
      },
    });
  }
}
