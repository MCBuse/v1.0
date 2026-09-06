import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateMerchantPaymentRequestDto {
  @ApiProperty({ description: 'EUR amount in integer cents', example: '1299' })
  @IsString()
  @Matches(/^[1-9]\d{0,8}$/, {
    message: 'amountMinor must be an integer from 1 to 999999999',
  })
  amountMinor: string;

  @ApiPropertyOptional({ maxLength: 140 })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  description?: string;
}
