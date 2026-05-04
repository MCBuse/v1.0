import { z } from 'zod';

// ── Requests ────────────────────────────────────────────────────────────────

export const loginRequest = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequest>;

export const loginPhoneRequest = z.object({
  phone:    z.string().min(1),
  password: z.string().min(1),
});
export type LoginPhoneRequest = z.infer<typeof loginPhoneRequest>;

export const signupRequest = z.object({
  email:     z.string().email().optional(),
  phone:     z.string().optional(),
  password:  z.string().min(8),
  firstName: z.string().min(1),
  lastName:  z.string().min(1),
});
export type SignupRequest = z.infer<typeof signupRequest>;

export const sendOtpRequest = z.object({
  phone: z.string().min(1),
});
export type SendOtpRequest = z.infer<typeof sendOtpRequest>;

export const verifyOtpRequest = z.object({
  phone: z.string().min(1),
  code:  z.string().length(6),
});
export type VerifyOtpRequest = z.infer<typeof verifyOtpRequest>;

export const forgotPasswordRequest = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: 'email or phone is required',
  });
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequest>;

export const resetPasswordRequest = z
  .object({
    email:       z.string().email().optional(),
    phone:       z.string().min(1).optional(),
    code:        z.string().length(6),
    newPassword: z.string().min(8),
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: 'email or phone is required',
  });
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequest>;

// ── Responses ───────────────────────────────────────────────────────────────

export const tokenPairResponse = z.object({
  accessToken:  z.string().min(1),
  refreshToken: z.string().min(1),
});
export type TokenPairResponse = z.infer<typeof tokenPairResponse>;
