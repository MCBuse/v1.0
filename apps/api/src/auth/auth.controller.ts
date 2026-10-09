import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { PhoneAuthGuard } from './guards/phone-auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { LoginPhoneDto } from './dto/login-phone.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

// Credential and code-guessing endpoints: 5 requests per minute per client IP.
// The global default (THROTTLE_LIMIT) is far too loose for these.
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: 'Register a new account' })
  @ApiCreatedResponse({ description: 'Returns access and refresh tokens' })
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Public()
  @Post('login')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiOkResponse({ description: 'Returns access and refresh tokens' })
  login(
    @Body() _dto: LoginDto,
    @CurrentUser() user: { id: string; email: string | null },
  ) {
    return this.authService.login(user);
  }

  @Public()
  @Post('login/phone')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @UseGuards(PhoneAuthGuard)
  @ApiOperation({ summary: 'Login with phone number and password' })
  @ApiOkResponse({ description: 'Returns access and refresh tokens' })
  loginPhone(
    @Body() _dto: LoginPhoneDto,
    @CurrentUser() user: { id: string; email: string | null },
  ) {
    return this.authService.login(user);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new token pair' })
  @ApiOkResponse({ description: 'Returns new access and refresh tokens' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke refresh token' })
  logout(
    @CurrentUser() user: { id: string },
    @Body() dto: RefreshTokenDto,
  ) {
    return this.authService.logout(user.id, dto.refreshToken);
  }

  @Public()
  @Post('forgot-password')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Request a password reset code via email or phone' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword({ email: dto.email, phone: dto.phone });
  }

  @Public()
  @Post('reset-password')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset password using a previously issued reset code' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword({
      email: dto.email,
      phone: dto.phone,
      code: dto.code,
      newPassword: dto.newPassword,
    });
  }

  @Post('phone/send-otp')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Send OTP to phone number' })
  sendOtp(
    @CurrentUser() user: { id: string },
    @Body() dto: SendOtpDto,
  ) {
    return this.authService.sendOtp(user.id, dto.phone);
  }

  @Post('phone/verify-otp')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Verify OTP and mark phone as verified' })
  verifyOtp(
    @CurrentUser() user: { id: string },
    @Body() dto: VerifyOtpDto,
  ) {
    return this.authService.verifyOtp(user.id, dto.phone, dto.code);
  }
}
