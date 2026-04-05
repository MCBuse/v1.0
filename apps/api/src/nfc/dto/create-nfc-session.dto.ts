import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreateNfcSessionDto {
  @ApiProperty({
    description: 'Amount to request in base units (6 decimals). E.g. "5000000" = 5 USDC',
    example: '5000000',
  })
  @IsString()
  @Matches(/^\d+$/, { message: 'amount must be a non-negative integer string' })
  amount: string;

  @ApiProperty({ enum: ['USDC', 'EURC'], example: 'USDC' })
  @IsIn(['USDC', 'EURC'])
  currency: string;

  @ApiPropertyOptional({
    description: 'Human-readable label shown in the payer\'s app on tap.',
    example: 'Coffee — 5 USDC',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      'Session TTL in seconds. Defaults to 60 (suitable for tap-to-pay). Range: 10–3600.',
    example: 60,
    default: 60,
  })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(3600)
  expiresInSeconds?: number;
}
