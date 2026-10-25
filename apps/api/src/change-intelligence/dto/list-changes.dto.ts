import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { ChangeTypeFilter } from '@repo/shared';

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /merchants/me/changes (plan §7). Unknown keys, e.g. merchantId, are rejected by the global pipe. */
export class ListChangesDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsIn(['demand', 'stock', 'threshold', 'correction'])
  type?: ChangeTypeFilter;

  @IsOptional()
  @IsIn(['active', 'resolved', 'all'])
  status?: 'active' | 'resolved' | 'all';

  /** Merchant-local date, inclusive. */
  @IsOptional()
  @Matches(LOCAL_DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  /** Merchant-local date, inclusive. */
  @IsOptional()
  @Matches(LOCAL_DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
