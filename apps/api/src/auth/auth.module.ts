import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { PhoneStrategy } from './strategies/phone.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { PhoneAuthGuard } from './guards/phone-auth.guard';
import { VerifiedEmailGuard } from './guards/verified-email.guard';
import { UsersModule } from '../users/users.module';
import { OtpModule } from '../otp/otp.module';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.register({}), // secrets injected at sign/verify time via ConfigService
    UsersModule,
    OtpModule,
    WalletsModule,
  ],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    PhoneStrategy,
    JwtAuthGuard,
    LocalAuthGuard,
    PhoneAuthGuard,
    VerifiedEmailGuard,
  ],
  controllers: [AuthController],
  exports: [JwtAuthGuard, LocalAuthGuard, PhoneAuthGuard, VerifiedEmailGuard],
})
export class AuthModule {}
