import { STOCK_ADJUSTMENT_REASONS } from '../stock-movements';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min, IsIn, IsOptional } from 'class-validator';

export class AdjustMerchantProductStockDto {
  @IsOptional()
  @IsIn(STOCK_ADJUSTMENT_REASONS)
  reason?: 'adjustment' | 'restock';
  @ApiProperty({ description: 'Change to physical on-hand stock', example: 12 })
  @IsInt()
  @Min(-999999999)
  @Max(999999999)
  change: number;
}
