import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class LoginPhoneDto {
  @ApiProperty({ example: '+447911123456' })
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, { message: 'phone must be a valid E.164 number' })
  phone: string;

  @ApiProperty({ example: 'P@ssw0rd!' })
  @IsString()
  password: string;
}
