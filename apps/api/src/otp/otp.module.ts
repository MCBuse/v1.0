import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MockOtpProvider } from './providers/mock-otp.provider';
import { TwilioOtpProvider } from './providers/twilio-otp.provider';
import { OTP_PROVIDER } from './otp-provider.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    MockOtpProvider,
    TwilioOtpProvider,
    {
      provide: OTP_PROVIDER,
      useFactory: (
        config: ConfigService,
        mock: MockOtpProvider,
        twilio: TwilioOtpProvider,
      ) => {
        const provider = config.get<string>('OTP_PROVIDER') ?? 'mock';
        return provider === 'twilio' ? twilio : mock;
      },
      inject: [ConfigService, MockOtpProvider, TwilioOtpProvider],
    },
  ],
  exports: [OTP_PROVIDER],
})
export class OtpModule {}
