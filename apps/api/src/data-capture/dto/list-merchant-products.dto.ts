import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListMerchantProductsDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsIn(['active', 'archived', 'all'])
  status?: 'active' | 'archived' | 'all';

  /** manual = no import source mapping; imported = at least one. */
  @IsOptional()
  @IsIn(['manual', 'imported', 'all'])
  source?: 'manual' | 'imported' | 'all';

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
