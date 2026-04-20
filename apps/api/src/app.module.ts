import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validate } from './config/config.validation';
import { LoggingModule } from './logging/logging.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OtpModule } from './otp/otp.module';
import { SolanaModule } from './solana/solana.module';
import { WalletsModule } from './wallets/wallets.module';
import { LedgerModule } from './ledger/ledger.module';
import { OnRampModule } from './onramp/onramp.module';
import { PaymentRequestsModule } from './payment-requests/payment-requests.module';
import { PaymentsModule } from './payments/payments.module';
import { SwapModule } from './swap/swap.module';
import { TransactionsModule } from './transactions/transactions.module';
import { OffRampModule } from './offramp/offramp.module';
import { NfcModule } from './nfc/nfc.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RatesModule } from './rates/rates.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? undefined : '.env',
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: process.env.NODE_ENV === 'test' ? (config) => config : validate,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL') ?? 60000,
          limit: config.get<number>('THROTTLE_LIMIT') ?? 100,
        },
      ],
    }),
    ScheduleModule.forRoot(),
    LoggingModule,
    DatabaseModule,
    HealthModule,
    SolanaModule,
    LedgerModule,
    WalletsModule,
    AuthModule,
    UsersModule,
    OtpModule,
    OnRampModule,
    PaymentRequestsModule,
    PaymentsModule,
    SwapModule,
    TransactionsModule,
    OffRampModule,
    NfcModule,
    RatesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
