import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches } from 'class-validator';

export class CreateOnrampSessionDto {
  @ApiProperty({ example: 'moonpay', enum: ['moonpay'] })
  @IsString()
  @IsIn(['moonpay'])
  provider: 'moonpay';

  @ApiProperty({ description: 'Fiat amount as decimal string, e.g. "25.00"' })
  @IsString()
  @Matches(/^\d+(\.\d{1,8})?$/, { message: 'fiatAmount must be a positive decimal string' })
  fiatAmount: string;

  @ApiProperty({ example: 'USD', enum: ['USD', 'EUR'] })
  @IsString()
  @IsIn(['USD', 'EUR'])
  fiatCurrency: 'USD' | 'EUR';
}
