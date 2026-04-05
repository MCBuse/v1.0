import { Injectable, Logger } from '@nestjs/common';
import { OtpProvider } from '../otp-provider.interface';

@Injectable()
export class MockOtpProvider implements OtpProvider {
  private static readonly OTP_TTL_MS = 5 * 60 * 1000;
  private readonly codes = new Map<string, { code: string; expiresAt: number }>();
  private readonly logger = new Logger(MockOtpProvider.name);
  private readonly allowMockFeatures = process.env.NODE_ENV !== 'production';

  private maskPhone(phone: string): string {
    if (phone.length <= 4) {
      return '*'.repeat(phone.length);
    }

    return `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}`;
  }

  private purgeExpiredCodes(): void {
    const now = Date.now();

    for (const [phone, entry] of this.codes.entries()) {
      if (entry.expiresAt <= now) {
        this.codes.delete(phone);
      }
    }
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    this.purgeExpiredCodes();
    this.codes.set(phone, {
      code,
      expiresAt: Date.now() + MockOtpProvider.OTP_TTL_MS,
    });

    if (this.allowMockFeatures) {
      this.logger.log(`[MockOTP] Code for ${this.maskPhone(phone)}: ${code}`);
    }
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    this.purgeExpiredCodes();

    const stored = this.codes.get(phone);
    const isValidStoredCode = stored?.code === code;
    const isValidBypassCode = this.allowMockFeatures && code === '123456';

    if (isValidStoredCode || isValidBypassCode) {
      this.codes.delete(phone);
      return true;
    }
    return false;
  }
}
