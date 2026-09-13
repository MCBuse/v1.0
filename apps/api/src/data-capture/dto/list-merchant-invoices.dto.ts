import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListMerchantInvoicesDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsIn([
    'open',
    'history',
    'pending',
    'processing',
    'completed',
    'expired',
    'cancelled',
    'failed',
  ])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
