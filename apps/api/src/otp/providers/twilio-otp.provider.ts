import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpProvider } from '../otp-provider.interface';

/**
 * Real OTP provider using Twilio Verify API.
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID env vars.
 */
@Injectable()
export class TwilioOtpProvider implements OtpProvider {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly serviceSid: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.accountSid = config.getOrThrow('TWILIO_ACCOUNT_SID');
    this.authToken = config.getOrThrow('TWILIO_AUTH_TOKEN');
    this.serviceSid = config.getOrThrow('TWILIO_VERIFY_SERVICE_SID');
    this.baseUrl = `https://verify.twilio.com/v2/Services/${this.serviceSid}`;
  }

  async sendOtp(phone: string, _code: string): Promise<void> {
    // Twilio Verify generates and sends the code — we don't pass our own
    const res = await fetch(`${this.baseUrl}/Verifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
            'base64',
          ),
      },
      body: new URLSearchParams({ To: phone, Channel: 'sms' }).toString(),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Twilio sendOtp failed: ${res.status} ${body}`);
    }
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/VerificationCheck`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
            'base64',
          ),
      },
      body: new URLSearchParams({ To: phone, Code: code }).toString(),
    });

    if (!res.ok) return false;
    const data = (await res.json()) as { status: string };
    return data.status === 'approved';
  }
}
