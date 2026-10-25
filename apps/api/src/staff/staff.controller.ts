import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  UseGuards,
} from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DRIZZLE } from '../database/database.provider';
import * as s from '../database/schema';
import { activeStaffPermissions, type StaffPermission } from './staff-access';

/**
 * Who the staff user is. Any active staff permission passes; the staff portal
 * shows only the areas the permissions allow. Each area's API enforces its
 * own permission.
 */
@Controller('staff')
@UseGuards(JwtAuthGuard)
export class StaffController {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof s>) {}

  @Get('me') async me(@CurrentUser() user: { id: string }): Promise<{
    permission: StaffPermission;
    permissions: StaffPermission[];
  }> {
    const permissions = await activeStaffPermissions(this.db, user.id);
    if (!permissions.length)
      throw new ForbiddenException('Staff access required');
    return {
      // Kept for clients that read the single permission.
      permission: permissions.includes('credit_analyst')
        ? 'credit_analyst'
        : permissions[0],
      permissions,
    };
  }
}
