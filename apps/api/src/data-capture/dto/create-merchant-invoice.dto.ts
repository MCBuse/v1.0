import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

function isLineType(value: unknown, type: 'product' | 'custom') {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).type === type
  );
}

export class CreateMerchantInvoiceLineDto {
  @ApiProperty({ enum: ['product', 'custom'] })
  @IsIn(['product', 'custom'])
  type: 'product' | 'custom';

  @ApiPropertyOptional()
  @ValidateIf((value: unknown) => isLineType(value, 'product'))
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @ValidateIf((value: unknown) => isLineType(value, 'custom'))
  @IsString()
  @Matches(/\S/, { message: 'custom item name is required' })
  @MaxLength(160)
  name?: string;

  @ApiProperty({ minimum: 1, maximum: 999 })
  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number;

  @ApiPropertyOptional({
    description: 'Custom item EUR price in integer cents',
  })
  @ValidateIf((value: unknown) => isLineType(value, 'custom'))
  @IsString()
  @Matches(/^[1-9]\d{0,8}$/)
  unitPriceMinor?: string;
}

export class CreateMerchantInvoiceDto {
  @ApiProperty({ type: [CreateMerchantInvoiceLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateMerchantInvoiceLineDto)
  lines: CreateMerchantInvoiceLineDto[];

  @ApiPropertyOptional({ maxLength: 140 })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  description?: string;

  @ApiPropertyOptional({ enum: [900, 3600, 86400], default: 3600 })
  @IsOptional()
  @IsIn([900, 3600, 86400])
  expiresInSeconds?: 900 | 3600 | 86400;
}
