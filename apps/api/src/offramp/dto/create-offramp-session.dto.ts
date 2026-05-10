import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class CreateOfframpSessionDto {
  @ApiProperty({ example: 'moonpay', enum: ['moonpay'] })
  @IsString()
  @IsIn(['moonpay'])
  provider: 'moonpay';

  @ApiProperty({
    description: 'USDC amount to sell in base units (6 decimals). E.g. "10000000" = 10 USDC',
    example: '10000000',
  })
  @IsString()
  @Matches(/^\d+$/, { message: 'cryptoAmount must be a non-negative integer string' })
  cryptoAmount: string;

  @ApiPropertyOptional({ enum: ['USDC'], default: 'USDC' })
  @IsOptional()
  @IsIn(['USDC'])
  cryptoCurrency?: 'USDC';

  @ApiPropertyOptional({ enum: ['USD', 'EUR'], default: 'USD' })
  @IsOptional()
  @IsIn(['USD', 'EUR'])
  fiatCurrency?: 'USD' | 'EUR';
}
