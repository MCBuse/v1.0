import {
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class StartFundingDto {
  @IsIn(['card', 'bank'])
  method: 'card' | 'bank';

  /** US cents, as a string so large values survive JSON intact. */
  @IsNumberString({ no_symbols: true })
  amountCents: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  successUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cancelUrl?: string;
}

export class StartTransferDto {
  @IsIn(['holding', 'routine'])
  from: 'holding' | 'routine';

  @IsIn(['holding', 'routine'])
  to: 'holding' | 'routine';

  @IsNumberString({ no_symbols: true })
  amountCents: string;

  @IsOptional()
  @IsIn(['manual', 'day_end'])
  purpose?: 'manual' | 'day_end';

  /** Merchant-local business date for a day-end sweep, as YYYY-MM-DD. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  businessDate?: string;
}

export class StartWithdrawalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  destinationId: string;

  @IsNumberString({ no_symbols: true })
  amountCents: string;
}
