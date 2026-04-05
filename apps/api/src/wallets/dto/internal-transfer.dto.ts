import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches } from 'class-validator';

export class InternalTransferDto {
  @ApiProperty({ enum: ['savings', 'routine'], example: 'savings' })
  @IsIn(['savings', 'routine'])
  fromWalletType: string;

  @ApiProperty({ enum: ['savings', 'routine'], example: 'routine' })
  @IsIn(['savings', 'routine'])
  toWalletType: string;

  @ApiProperty({
    description: 'Amount in base units (6 decimals). E.g. "1000000" = 1 USDC',
    example: '1000000',
  })
  @IsString()
  @Matches(/^\d+$/, { message: 'amount must be a non-negative integer string' })
  amount: string;

  @ApiProperty({ enum: ['USDC', 'EURC'], example: 'USDC' })
  @IsIn(['USDC', 'EURC'])
  currency: string;
}
