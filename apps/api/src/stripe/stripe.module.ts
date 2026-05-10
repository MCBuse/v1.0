import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StripeClient } from './stripe.client';

@Module({
  imports: [ConfigModule],
  providers: [StripeClient],
  exports: [StripeClient],
})
export class StripeModule {}
