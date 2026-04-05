import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class InitiateOffRampDto {
  @ApiProperty({
    description: 'Amount to withdraw in base units (6 decimals). E.g. "10000000" = 10 USDC',
    example: '10000000',
  })
  @IsString()
  @Matches(/^\d+$/, { message: 'amount must be a non-negative integer string' })
  amount: string;

  @ApiProperty({ enum: ['USDC', 'EURC'], example: 'USDC' })
  @IsIn(['USDC', 'EURC'])
  currency: string;

  @ApiPropertyOptional({
    description:
      'Destination bank account reference (required for real providers). ' +
      'Format depends on provider: Circle accepts a bank account UUID from their API.',
    example: 'ba_1234abcd',
  })
  @IsOptional()
  @IsString()
  bankAccountRef?: string;
}
