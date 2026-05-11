import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class LineItemDto {
  @ApiProperty({ example: 'Latte', maxLength: 60 })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @ApiProperty({ example: 2, minimum: 1, maximum: 999 })
  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number;

  @ApiProperty({
    description: 'Unit price in base units (6 decimals). E.g. "4500000" = 4.5 USDC',
    example: '4500000',
  })
  @IsString()
  @Matches(/^\d+$/, { message: 'unitAmount must be a non-negative integer string' })
  unitAmount: string;
}

export class CreatePaymentRequestDto {
  @ApiProperty({ enum: ['static', 'dynamic'], example: 'dynamic' })
  @IsIn(['static', 'dynamic'])
  type: string;

  @ApiPropertyOptional({
    description:
      'Amount in base units (6 decimals). Required for amount-only dynamic requests. Omit when lineItems are provided.',
    example: '5000000',
  })
  @ValidateIf((o) => o.amount !== undefined)
  @IsString()
  @Matches(/^\d+$/, { message: 'amount must be a non-negative integer string' })
  amount?: string;

  @ApiPropertyOptional({ enum: ['USDC', 'EURC'], example: 'USDC' })
  @ValidateIf((o) => o.type === 'dynamic' || o.currency !== undefined)
  @IsIn(['USDC', 'EURC'])
  currency?: string;

  @ApiPropertyOptional({ example: 'Coffee at Acme Café', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  description?: string;

  @ApiPropertyOptional({
    type: [LineItemDto],
    description: 'Itemised invoice. When present, server computes amount = Σ(quantity × unitAmount); type must be dynamic.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems?: LineItemDto[];

  @ApiPropertyOptional({
    description: 'Dynamic only. Seconds until expiry. Default 300 (5 min), max 86400 (24 h).',
    example: 300,
  })
  @ValidateIf((o) => o.type === 'dynamic')
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(86400)
  expiresInSeconds?: number;
}
