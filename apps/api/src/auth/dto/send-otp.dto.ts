import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SendOtpDto {
  @ApiProperty({ example: '+447911123456' })
  @IsString()
  phone: string;
}
