import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreatePaymentRequestDto {
  @ApiProperty({ enum: ['static', 'dynamic'], example: 'dynamic' })
  @IsIn(['static', 'dynamic'])
  type: string;

  @ApiPropertyOptional({
    description: 'Required for dynamic. Amount in base units (6 decimals). E.g. "5000000" = 5 USDC',
    example: '5000000',
  })
  @ValidateIf((o) => o.type === 'dynamic')
  @IsString()
  @Matches(/^\d+$/, { message: 'amount must be a non-negative integer string' })
  amount?: string;

  @ApiPropertyOptional({ enum: ['USDC', 'EURC'], example: 'USDC' })
  @ValidateIf((o) => o.type === 'dynamic')
  @IsIn(['USDC', 'EURC'])
  currency?: string;

  @ApiPropertyOptional({ example: 'Coffee at Acme Café', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  description?: string;

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
