export interface OtpProvider {
  sendOtp(phone: string, code: string): Promise<void>;
  verifyOtp(phone: string, code: string): Promise<boolean>;
}

export const OTP_PROVIDER = 'OTP_PROVIDER';
