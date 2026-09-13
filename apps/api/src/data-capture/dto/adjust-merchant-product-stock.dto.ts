import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class AdjustMerchantProductStockDto {
  @ApiProperty({ description: 'Change to physical on-hand stock', example: 12 })
  @IsInt()
  @Min(-999999999)
  @Max(999999999)
  change: number;
}
