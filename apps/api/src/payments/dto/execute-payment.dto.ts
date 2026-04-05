import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class ExecutePaymentDto {
  @ApiProperty({
    description: 'Nonce from the scanned QR payload (mcbuse://pay?nonce=...)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsUUID('4')
  nonce: string;

  @ApiPropertyOptional({
    description: 'Required for static QR. Amount in base units (6 decimals). E.g. "5000000" = 5 USDC',
    example: '5000000',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'amount must be a non-negative integer string' })
  amount?: string;

  @ApiPropertyOptional({
    description: 'Required for static QR.',
    enum: ['USDC', 'EURC'],
  })
  @IsOptional()
  @IsIn(['USDC', 'EURC'])
  currency?: string;
}
