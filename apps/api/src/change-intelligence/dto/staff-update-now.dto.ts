import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** GET /staff/changes/merchants?q= (plan §8). */
export class StaffChangeMerchantsDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}

/** POST /staff/changes/update-now (plan §8). merchantId comes from the picker. */
export class StaffUpdateNowDto {
  @IsUUID()
  merchantId: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason: string;
}
