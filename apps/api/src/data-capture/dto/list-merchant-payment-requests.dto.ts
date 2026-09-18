import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListMerchantPaymentRequestsDto {
  @IsOptional()
  @IsIn(['pending', 'processing', 'completed', 'expired', 'cancelled', 'failed'])
  status?: 'pending' | 'processing' | 'completed' | 'expired' | 'cancelled' | 'failed';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  query?: string;

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
