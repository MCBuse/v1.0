import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateMerchantProductDto {
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @Matches(/\S/, { message: 'name is required' })
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ description: 'EUR price in integer cents', example: '1299' })
  @IsString()
  @Matches(/^[1-9]\d{0,8}$/)
  unitPriceMinor: string;

  @ApiProperty({ minimum: 0, maximum: 999999999, example: 10 })
  @IsInt()
  @Min(0)
  @Max(999999999)
  quantity: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 999999999, default: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999999999)
  lowStockThreshold?: number;
}
