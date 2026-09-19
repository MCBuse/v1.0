import { z } from 'zod';

export const stableCurrencySchema = z.enum(['USDC', 'EURC']);
export type StableCurrency = z.infer<typeof stableCurrencySchema>;

export const usernameAvailabilitySchema = z.object({
  username:    z.string(),
  available:   z.boolean(),
  suggestions: z.array(z.string()),
});
export type UsernameAvailability = z.infer<typeof usernameAvailabilitySchema>;

export const userProfileSchema = z.object({
  id:                z.string(),
  email:             z.string().nullable().optional(),
  phone:             z.string().nullable().optional(),
  pendingPhone:      z.string().nullable().optional(),
  username:          z.string(),
  primaryCurrency:   stableCurrencySchema,
  firstName:         z.string(),
  lastName:          z.string(),
  isEmailVerified:   z.boolean(),
  isPhoneVerified:   z.boolean(),
  isActive:          z.boolean(),
  createdAt:         z.string(),
  updatedAt:         z.string(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export const updateProfileInputSchema = z.object({
  firstName:       z.string().trim().min(1).max(100).optional(),
  lastName:        z.string().trim().min(1).max(100).optional(),
  username:        z.string().optional(),
  primaryCurrency: stableCurrencySchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

export const resolvedUsernameSchema = z.object({
  username:    z.string(),
  displayName: z.string(),
});
export type ResolvedUsername = z.infer<typeof resolvedUsernameSchema>;
