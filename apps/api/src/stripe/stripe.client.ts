import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

type StripeInstance = Stripe.Stripe;

@Injectable()
export class StripeClient {
  readonly stripe: StripeInstance;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.getOrThrow<string>('STRIPE_SECRET_KEY');
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
