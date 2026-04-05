import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches } from 'class-validator';

export class PreviewSwapDto {
  @ApiProperty({
    description: 'Currency to swap from',
    enum: ['USDC', 'EURC'],
    example: 'USDC',
  })
  @IsIn(['USDC', 'EURC'])
  fromCurrency: string;

  @ApiProperty({
    description: 'Currency to swap to',
    enum: ['USDC', 'EURC'],
    example: 'EURC',
  })
  @IsIn(['USDC', 'EURC'])
  toCurrency: string;

  @ApiProperty({
    description: 'Amount to swap in base units (6 decimals). E.g. "10000000" = 10 USDC',
    example: '10000000',
  })
  @IsString()
  @Matches(/^\d+$/, { message: 'fromAmount must be a non-negative integer string' })
  fromAmount: string;
}
