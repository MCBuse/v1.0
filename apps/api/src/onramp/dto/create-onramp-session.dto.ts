import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export type OnrampProvider = 'stripe' | 'moonpay';

export class CreateOnrampSessionDto {
  @ApiPropertyOptional({ example: 'stripe', enum: ['stripe', 'moonpay'], default: 'stripe' })
  @IsOptional()
  @IsString()
  @IsIn(['stripe', 'moonpay'])
  provider?: OnrampProvider;

  @ApiProperty({ description: 'Fiat amount as decimal string, e.g. "25.00"' })
  @IsString()
  @Matches(/^\d+(\.\d{1,8})?$/, { message: 'fiatAmount must be a positive decimal string' })
  fiatAmount: string;

  @ApiProperty({ example: 'USD', enum: ['USD', 'EUR'] })
  @IsString()
  @IsIn(['USD', 'EUR'])
  fiatCurrency: 'USD' | 'EUR';
}
