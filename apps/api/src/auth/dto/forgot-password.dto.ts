import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, ValidateIf } from 'class-validator';

/**
 * Request a password reset code. Caller supplies either an email or a phone
 * number — the response is intentionally generic so we don't leak which
 * identifiers are registered.
 */
export class ForgotPasswordDto {
  @ApiPropertyOptional({ example: 'user@example.com' })
  @ValidateIf((o: ForgotPasswordDto) => !o.phone)
  @IsEmail({}, { message: 'email must be an email address' })
  email?: string;

  @ApiPropertyOptional({ example: '+447911123456' })
  @ValidateIf((o: ForgotPasswordDto) => !o.email)
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, { message: 'phone must be a valid E.164 number' })
  phone?: string;
}
