import { Controller, Get, Patch, Body, Query, NotFoundException } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Get('username-availability')
  @ApiOperation({ summary: 'Check username availability' })
  @ApiQuery({ name: 'username', required: true, example: 'fred123' })
  checkUsername(@Query('username') username: string) {
    return this.usersService.checkUsernameAvailability(username ?? '');
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current user profile' })
  async me(@CurrentUser() user: { id: string }) {
    const profile = await this.usersService.findById(user.id);
    if (!profile) throw new NotFoundException('User not found');
    return profile;
  }

  @Patch('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update current user profile preferences' })
  updateMe(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Get('resolve-username')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Resolve a username for payments' })
  @ApiQuery({ name: 'username', required: true, example: 'fred123' })
  async resolveUsername(@Query('username') username: string) {
    const recipient = await this.usersService.findByUsername(username ?? '');
    if (!recipient || !recipient.isActive) {
      throw new NotFoundException('User not found');
    }

    return {
      username: recipient.username,
      displayName: `${recipient.firstName} ${recipient.lastName}`.trim(),
    };
  }
}
