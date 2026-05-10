import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class InitiateMoonpayDepositDto {
  @ApiProperty({ description: 'MoonPay sell transaction id.' })
  @IsString()
  @MinLength(1)
  transactionId: string;

  @ApiProperty({ description: 'MoonPay crypto currency code from the SDK event.', example: 'usdc_sol' })
  @IsString()
  @MinLength(1)
  cryptoCurrencyCode: string;

  @ApiProperty({ description: 'Display crypto amount from the SDK event.', example: '10.5' })
  @IsString()
  @MinLength(1)
  cryptoCurrencyAmount: string;

  @ApiProperty({
    description: 'Smallest-denomination crypto amount from the SDK event.',
    example: '10500000',
  })
  @IsString()
  @Matches(/^\d+$/, {
    message: 'cryptoCurrencyAmountSmallestDenomination must be a non-negative integer string',
  })
  cryptoCurrencyAmountSmallestDenomination: string;

  @ApiProperty({ description: 'MoonPay deposit wallet address from the SDK event.' })
  @IsString()
  @MinLength(1)
  depositWalletAddress: string;

  @ApiPropertyOptional({ description: 'Deposit wallet memo/tag when provided by MoonPay.' })
  @IsOptional()
  @IsString()
  depositWalletAddressTag?: string | null;

  @ApiPropertyOptional({ description: 'Fiat currency code from the SDK event.', example: 'usd' })
  @IsOptional()
  @IsString()
  fiatCurrencyCode?: string;

  @ApiPropertyOptional({ description: 'Fiat amount from the SDK event.', example: '9.85' })
  @IsOptional()
  @IsString()
  fiatCurrencyAmount?: string | null;
}
