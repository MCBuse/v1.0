import { IsIn, IsISO8601, IsOptional } from 'class-validator';

export class GeneralAnalyticsQueryDto {
  /** `today` is a first-class choice, not a special case of a custom range. */
  @IsOptional()
  @IsIn(['today', '7d', '30d', '90d', '180d', '365d'])
  period?: 'today' | '7d' | '30d' | '90d' | '180d' | '365d';

  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;

  /** Grouping is explicit rather than inferred from the range length. */
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  grouping?: 'day' | 'week' | 'month';

  @IsOptional()
  @IsIn(['mcbuse_payment', 'merchant_cash'])
  source?: 'mcbuse_payment' | 'merchant_cash';
}
