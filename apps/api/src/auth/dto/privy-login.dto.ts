import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class PrivyLoginDto {
  @ApiProperty({ description: 'Access token issued by Privy after successful login' })
  @IsString()
  @MinLength(20)
  privyAccessToken!: string;

  @ApiProperty({
    description: 'Solana public key of the user\'s Privy embedded wallet (base58)',
  })
  @IsString()
  @MinLength(32)
  solanaPubkey!: string;

  @ApiPropertyOptional({
    description: 'Email captured by the Privy login flow, if any',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Phone captured by the Privy login flow (E.164), if any',
  })
  @IsOptional()
  @IsString()
  phone?: string;
}
