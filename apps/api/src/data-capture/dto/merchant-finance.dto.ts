import {
  IsUUID,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
export class CreateMerchantFinancePackageDto {
  /** Ties the package to a specific saved assessment. Defaults to the latest. */
  @IsOptional()
  @IsUUID()
  assessmentId?: string;
  @IsOptional() @IsInt() @Min(7) @Max(90) periodDays?: number;
  @IsOptional() @IsBoolean() demonstrationData?: boolean;
}
export class EmailMerchantFinancePackageDto {
  @IsEmail() @MaxLength(320) recipientEmail: string;
  @IsOptional() @IsString() @MaxLength(160) institutionName?: string;
  @IsBoolean() confirmed: boolean;
}
