import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min, Max, IsObject, IsOptional } from 'class-validator';

export class BillingDetailsDto {
  @IsString() name: string;
  @IsString() city: string;
  @IsString() country: string; // ISO 3166-1 alpha-2, e.g. "US"
  @IsString() line1: string;
  @IsString() postalCode: string;
  @IsString() @IsOptional() district?: string;
}

export class CreateCardDto {
  @ApiProperty({ description: 'Key ID from GET /onramp/encryption-key' })
  @IsString()
  keyId: string;

  @ApiProperty({ description: 'Base64-encoded RSA-encrypted card data' })
  @IsString()
  encryptedData: string;

  @ApiProperty({ example: 1 })
  @IsInt() @Min(1) @Max(12)
  expMonth: number;

  @ApiProperty({ example: 2025 })
  @IsInt() @Min(2024)
  expYear: number;

  @ApiProperty()
  @IsObject()
  billingDetails: BillingDetailsDto;
}
