import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from '../../users/users.service';

/**
 * Apply to routes that require email verification before access.
 * Usage: @UseGuards(VerifiedEmailGuard) on controllers or routes.
 * Phase 3+ routes (wallet creation, transfers) must use this guard.
 */
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as { id: string } | undefined;
    if (!user?.id) return false;

    const fullUser = await this.usersService.findById(user.id);
    if (!fullUser?.isEmailVerified) {
      throw new ForbiddenException(
        'Email verification required. Check your inbox for a verification link.',
      );
    }
    return true;
  }
}
