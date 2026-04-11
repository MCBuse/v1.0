import { z } from 'zod';

// ── Primitives ────────────────────────────────────────────────────────────────

const emailField = z
  .string()
  .min(1, 'Email is required')
  .email('Enter a valid email address');

const phoneField = z
  .string()
  .min(1, 'Phone number is required')
  .regex(/^\+?[1-9]\d{6,14}$/, 'Enter a valid phone number (e.g. +12125551234)');

// ── Login ─────────────────────────────────────────────────────────────────────

export const loginSchema = z
  .object({
    mode:       z.enum(['email', 'phone']),
    identifier: z.string().min(1, 'This field is required'),
    password:   z.string().min(6, 'Password must be at least 6 characters'),
  })
  .superRefine((data, ctx) => {
    const result =
      data.mode === 'email'
        ? emailField.safeParse(data.identifier)
        : phoneField.safeParse(data.identifier);

    if (!result.success) {
      ctx.addIssue({
        code:    z.ZodIssueCode.custom,
        path:    ['identifier'],
        message: result.error.issues[0]?.message ?? 'Invalid value',
      });
    }
  });

export type LoginFormValues = z.infer<typeof loginSchema>;

// ── Register ──────────────────────────────────────────────────────────────────

export const registerSchema = z
  .object({
    mode:       z.enum(['email', 'phone']),
    fullName:   z.string().min(2, 'Enter your full name'),
    identifier: z.string().min(1, 'This field is required'),
    password:   z.string().min(8, 'Password must be at least 8 characters'),
    confirm:    z.string().min(1, 'Please confirm your password'),
  })
  .superRefine((data, ctx) => {
    // Identifier format
    const identResult =
      data.mode === 'email'
        ? emailField.safeParse(data.identifier)
        : phoneField.safeParse(data.identifier);

    if (!identResult.success) {
      ctx.addIssue({
        code:    z.ZodIssueCode.custom,
        path:    ['identifier'],
        message: identResult.error.issues[0]?.message ?? 'Invalid value',
      });
    }

    // Password confirmation
    if (data.password !== data.confirm) {
      ctx.addIssue({
        code:    z.ZodIssueCode.custom,
        path:    ['confirm'],
        message: 'Passwords do not match',
      });
    }
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;
