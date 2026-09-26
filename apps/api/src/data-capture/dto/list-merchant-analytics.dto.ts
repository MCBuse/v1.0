import { IsIn, IsISO8601, IsOptional } from 'class-validator';

export class ListMerchantAnalyticsDto {
  @IsOptional() @IsIn(['7d', '30d', '90d']) period?: '7d' | '30d' | '90d';
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsIn(['mcbuse_payment', 'merchant_cash']) source?: 'mcbuse_payment' | 'merchant_cash';
}
