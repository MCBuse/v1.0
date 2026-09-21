import { BadRequestException } from '@nestjs/common';
import type { CreditProfile } from '@repo/shared';
import { CREDIT_MONEY_FIELDS } from './credit-contract';
const other = [
  'commencementDate',
  'merchantType',
  'loanTermMonths',
  'externalBureauScore',
  'externalBureauReport',
];
export function validateCreditProfile(
  input: Record<string, unknown>,
  today = new Date().toISOString().slice(0, 10),
): CreditProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BadRequestException('Expected credit profile');
  for (const [key, value] of Object.entries(input)) {
    if (![...CREDIT_MONEY_FIELDS, ...other].includes(key))
      throw new BadRequestException(`Unknown profile field: ${key}`);
    if (value === null) continue;
    if ((CREDIT_MONEY_FIELDS as readonly string[]).includes(key)) {
      if (typeof value !== 'string' || !/^(0|[1-9]\d{0,13})$/.test(value))
        throw new BadRequestException(
          `${key} must be non-negative integer cents`,
        );
    } else if (key === 'commencementDate') {
      if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value ||
        value > today
      )
        throw new BadRequestException(
          'Enter a valid commencement date that is not in the future',
        );
    } else if (key === 'merchantType') {
      if (
        typeof value !== 'string' ||
        !['cafe_bakery', 'grocer', 'kiosk', 'takeaway'].includes(value)
      )
        throw new BadRequestException('Unsupported merchant category');
    } else if (key === 'externalBureauReport') {
      if (typeof value !== 'string' || value.length > 2000)
        throw new BadRequestException(
          'Bureau report must be at most 2000 characters',
        );
    } else if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > (key === 'loanTermMonths' ? 600 : 1000000)
    )
      throw new BadRequestException(`Invalid ${key}`);
  }
  return input as CreditProfile;
}
export function euroMajor(
  minor: string | bigint | null | undefined,
): number | null {
  if (minor === null || minor === undefined) return null;
  const n = BigInt(minor);
  if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(n) / 100;
}
