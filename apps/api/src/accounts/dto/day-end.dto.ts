import {
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ConfirmDayEndDto {
  @IsNumberString({ no_symbols: true })
  amountCents: string;

  /** Merchant-local date the sweep belongs to, as YYYY-MM-DD. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  businessDate?: string;
}
