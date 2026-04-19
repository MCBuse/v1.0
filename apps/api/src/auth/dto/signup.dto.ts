import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  Matches,
  ValidateIf,
} from 'class-validator';

/**
 * Signup supports either an email or a phone number (or both). `ValidateIf`
 * only runs the field's other validators when the counterpart is missing, so
 * the user must supply at least one identifier.
 */
export class SignupDto {
  @ApiPropertyOptional({ example: 'user@example.com' })
  @ValidateIf((o: SignupDto) => !o.phone)
  @IsEmail({}, { message: 'email must be an email address' })
  email?: string;

  @ApiPropertyOptional({ example: '+447911123456' })
  @ValidateIf((o: SignupDto) => !o.email)
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, { message: 'phone must be a valid E.164 number' })
  phone?: string;

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
  password: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;
}
