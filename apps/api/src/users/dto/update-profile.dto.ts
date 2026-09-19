import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane', maxLength: 100 })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const value = obj[key];
    return typeof value === 'string' ? value.trim() : value;
  })
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe', maxLength: 100 })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const value = obj[key];
    return typeof value === 'string' ? value.trim() : value;
  })
  @IsString()
  @Length(1, 100)
  lastName?: string;

  @ApiPropertyOptional({ example: 'fred123' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ enum: ['USDC', 'EURC'], example: 'USDC' })
  @IsOptional()
  @IsIn(['USDC', 'EURC'])
  primaryCurrency?: 'USDC' | 'EURC';
}
