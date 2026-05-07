import { http } from '@/lib/api';

import {
  resolvedUsernameSchema,
  userProfileSchema,
  usernameAvailabilitySchema,
  type ResolvedUsername,
  type UpdateProfileInput,
  type UserProfile,
  type UsernameAvailability,
} from './models';

export function normalizeUsernameInput(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export function isUsernameFormatValid(value: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(normalizeUsernameInput(value));
}

export const usersRepository = {
  async checkUsernameAvailability(username: string): Promise<UsernameAvailability> {
    const raw = await http.get<unknown>('/users/username-availability', {
      params: { username: normalizeUsernameInput(username) },
    });
    return usernameAvailabilitySchema.parse(raw);
  },

  async getProfile(): Promise<UserProfile> {
    const raw = await http.get<unknown>('/users/me');
    return userProfileSchema.parse(raw);
  },

  async updateProfile(input: UpdateProfileInput): Promise<UserProfile> {
    const raw = await http.patch<unknown>('/users/me', input);
    return userProfileSchema.parse(raw);
  },

  async resolveUsername(username: string): Promise<ResolvedUsername> {
    const raw = await http.get<unknown>('/users/resolve-username', {
      params: { username: normalizeUsernameInput(username) },
    });
    return resolvedUsernameSchema.parse(raw);
  },
};
