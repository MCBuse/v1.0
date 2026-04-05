import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { OtpProvider } from '../otp-provider.interface';

@Injectable()
export class MockOtpProvider implements OtpProvider {
  private readonly codes = new Map<string, string>();

  constructor(
    @InjectPinoLogger(MockOtpProvider.name)
    private readonly logger: PinoLogger,
  ) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    this.codes.set(phone, code);
    this.logger.info({ phone }, `[MockOTP] Code for ${phone}: ${code}`);
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
