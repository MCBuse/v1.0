import { IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateSubmissionDto {
  @IsOptional()
  @IsString()
  issuer?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  ticker?: string;

  @IsOptional()
  @IsString()
  network?: string;

  @IsOptional()
  @IsString()
  contract?: string;

  @IsOptional()
  @IsString()
  reserve?: string;

  @IsOptional()
  @IsUrl()
  attestation?: string;
}
