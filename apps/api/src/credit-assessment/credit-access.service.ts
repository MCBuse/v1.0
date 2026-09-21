import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as s from '../database/schema';
import { CreditEvidenceService } from './credit-evidence.service';
@Injectable()
export class CreditAccessService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof s>,
    private readonly evidence: CreditEvidenceService,
  ) {}
  async requireStaff(userId: string) {
    const [row] = await this.db
      .select({ id: s.users.id })
      .from(s.staffPermissions)
      .innerJoin(s.users, eq(s.users.id, s.staffPermissions.userId))
      .where(
        and(
          eq(s.staffPermissions.userId, userId),
          eq(s.staffPermissions.permission, 'credit_analyst'),
          eq(s.staffPermissions.active, true),
          eq(s.users.isActive, true),
        ),
      );
    if (!row) throw new ForbiddenException('Credit analyst access required');
  }
  async requirePilot(merchantId: string) {
    const [row] = await this.db
      .select({ id: s.merchants.id })
      .from(s.creditPilotEnrollments)
      .innerJoin(
        s.merchants,
        eq(s.merchants.id, s.creditPilotEnrollments.merchantId),
      )
      .where(
        and(
          eq(s.creditPilotEnrollments.merchantId, merchantId),
          eq(s.creditPilotEnrollments.active, true),
          eq(s.merchants.isActive, true),
        ),
      );
    if (!row || !(await this.evidence.consent(merchantId)).active)
      throw new NotFoundException('Enrolled and consented merchant not found');
  }
  async audit(userId: string, action: string, entityId?: string) {
    await this.db.insert(s.auditLogs).values({
      userId,
      action,
      entityType: 'credit_assessment',
      entityId: entityId ?? null,
    });
  }
}
@Injectable()
export class CreditAnalystGuard implements CanActivate {
  constructor(private readonly access: CreditAccessService) {}
  async canActivate(context: ExecutionContext) {
    const user = context
      .switchToHttp()
      .getRequest<{ user?: { id: string } }>().user;
    if (!user?.id)
      throw new ForbiddenException('Credit analyst access required');
    await this.access.requireStaff(user.id);
    return true;
  }
}
