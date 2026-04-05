import { Injectable, Logger } from '@nestjs/common';
import { OtpProvider } from '../otp-provider.interface';

@Injectable()
export class MockOtpProvider implements OtpProvider {
  private readonly codes = new Map<string, string>();
  private readonly logger = new Logger(MockOtpProvider.name);

  async sendOtp(phone: string, code: string): Promise<void> {
    this.codes.set(phone, code);
    this.logger.log(`[MockOTP] Code for ${phone}: ${code}`);
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    const stored = this.codes.get(phone);
    if (stored === code || code === '123456') {
      this.codes.delete(phone);
      return true;
    }
    return false;
  }
}
