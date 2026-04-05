import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches } from 'class-validator';

export class InitiateOnRampDto {
  @ApiProperty({
    description: 'Amount in base units (6 decimals). E.g. "10000000" = 10 USDC',
    example: '10000000',
  })
  @IsString()
  @Matches(/^\d+$/, { message: 'amount must be a non-negative integer string' })
  amount: string;

  @ApiProperty({ enum: ['USDC', 'EURC'], example: 'USDC' })
  @IsIn(['USDC', 'EURC'])
  currency: string;
}
