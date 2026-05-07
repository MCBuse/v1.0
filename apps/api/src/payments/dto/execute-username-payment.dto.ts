import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches } from 'class-validator';

export class ExecuteUsernamePaymentDto {
  @ApiProperty({ example: 'fred123' })
  @IsString()
  username: string;

  @ApiProperty({
    description: 'Amount in base units (6 decimals). E.g. "5000000" = 5 USDC',
    example: '5000000',
  })
  @IsString()
  @Matches(/^\d+$/, { message: 'amount must be a non-negative integer string' })
  amount: string;

  @ApiProperty({ enum: ['USDC', 'EURC'], example: 'USDC' })
  @IsIn(['USDC', 'EURC'])
  currency: string;
}
