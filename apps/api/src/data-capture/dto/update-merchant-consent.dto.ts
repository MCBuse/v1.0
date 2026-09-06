import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateMerchantConsentDto {
  @ApiProperty({ description: 'Grant or revoke evidence-assessment consent' })
  @IsBoolean()
  active: boolean;
}
