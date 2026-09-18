import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateMerchantProfileDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'business name cannot be empty' })
  @MaxLength(160)
  businessName?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
}
