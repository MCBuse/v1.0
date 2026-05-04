import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Length,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class ResetPasswordDto {
  @ApiPropertyOptional({ example: 'user@example.com' })
  @ValidateIf((o: ResetPasswordDto) => !o.phone)
  @IsEmail({}, { message: 'email must be an email address' })
  email?: string;

  @ApiPropertyOptional({ example: '+447911123456' })
  @ValidateIf((o: ResetPasswordDto) => !o.email)
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, { message: 'phone must be a valid E.164 number' })
  phone?: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code: string;

  @ApiProperty({
    description: 'Min 8 chars, must include uppercase, lowercase, digit, and special char',
    example: 'P@ssw0rd!',
  })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character',
  })
  newPassword: string;
}
