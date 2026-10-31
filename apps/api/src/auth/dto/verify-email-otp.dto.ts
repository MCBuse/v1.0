import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class VerifyEmailOtpDto {
  @ApiProperty({
    example: '123456',
    description: '6-digit code sent to the account email',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;
}
