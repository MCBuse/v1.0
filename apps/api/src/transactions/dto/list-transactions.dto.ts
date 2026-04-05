import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListTransactionsDto {
  @ApiPropertyOptional({
    description: 'Which wallet to query',
    enum: ['savings', 'routine'],
    example: 'savings',
  })
  @IsOptional()
  @IsIn(['savings', 'routine'])
  walletType?: string;

  @ApiPropertyOptional({
    description: 'Filter by currency',
    enum: ['USDC', 'EURC'],
    example: 'USDC',
  })
  @IsOptional()
  @IsIn(['USDC', 'EURC'])
  currency?: string;

  @ApiPropertyOptional({
    description: 'Filter by entry type',
    enum: ['on_ramp', 'off_ramp', 'internal', 'p2p', 'swap'],
    example: 'p2p',
  })
  @IsOptional()
  @IsIn(['on_ramp', 'off_ramp', 'internal', 'p2p', 'swap'])
  type?: string;

  @ApiPropertyOptional({
    description: 'Start of date range (ISO 8601)',
    example: '2025-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'End of date range (ISO 8601)',
    example: '2025-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of results (1–100)',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Number of results to skip (for pagination)',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
