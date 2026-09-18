import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

class CashSaleLineDto {
  @IsIn(['product', 'custom']) type: 'product' | 'custom';
  @ValidateIf((line: CashSaleLineDto) => line.type === 'product') @IsUUID() productId?: string;
  @ValidateIf((line: CashSaleLineDto) => line.type === 'custom') @IsString() @Matches(/\S/) @MaxLength(160) name?: string;
  @IsInt() @Min(1) @Max(999) quantity: number;
  @ValidateIf((line: CashSaleLineDto) => line.type === 'custom') @IsString() @Matches(/^[1-9]\d{0,8}$/) unitPriceMinor?: string;
}

export class CreateMerchantCashSaleDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CashSaleLineDto) lines: CashSaleLineDto[];
  @IsOptional() @IsString() @MaxLength(140) description?: string;
  @IsISO8601() occurredAt: string;
  @IsOptional() @IsBoolean() stockAlreadyAccountedFor?: boolean;
}

export class VoidMerchantCashSaleDto { @IsString() @Matches(/\S/) @MaxLength(280) reason: string; }
