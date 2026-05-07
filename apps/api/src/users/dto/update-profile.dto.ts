import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'fred123' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ enum: ['USDC', 'EURC'], example: 'USDC' })
  @IsOptional()
  @IsIn(['USDC', 'EURC'])
  primaryCurrency?: 'USDC' | 'EURC';
}
