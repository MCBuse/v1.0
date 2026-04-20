import { IsNumberString, IsString, IsOptional, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class PreviewRateDto {
  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsNumberString()
  amount: string;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  feePct?: number;
}
