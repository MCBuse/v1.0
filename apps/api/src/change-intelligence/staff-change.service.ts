import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { StaffChangeMerchant, StaffUpdateNowResponse } from '@repo/shared';
import { DRIZZLE, type DrizzleDB } from '../database/database.provider';
import * as schema from '../database/schema';
import { activeStaffPermissions } from '../staff/staff-access';
import { ChangeIntelligenceConfig } from './change-intelligence.config';
import { ChangeJobTrigger } from './change-job-trigger';
import {
  processingState,
  WORK_PROCESSING_SQL,
  type WorkProcessingRow,
} from './change-read.service';
import { ChangeWorkQueueService } from './change-work-queue.service';

export const UPDATE_NOW_ENTITY = 'change_update_now';
const PICKER_LIMIT = 50;

/**
 * `change_intelligence_operator` only (plan §8). Merchants and owners get 404,
 * as if the route did not exist; other users, including staff with other
 * permissions, get 403.
 */
@Injectable()
export class ChangeOperatorGuard implements CanActivate {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const userId = context
      .switchToHttp()
      .getRequest<{ user?: { id?: string } }>().user?.id;
    if (!userId) throw new ForbiddenException('Staff access required');
    if (
      (await activeStaffPermissions(this.db, userId)).includes(
        'change_intelligence_operator',
      )
    )
      return true;
    const [membership] = await this.db
      .select({ id: schema.merchantMemberships.id })
      .from(schema.merchantMemberships)
      .where(eq(schema.merchantMemberships.userId, userId))
      .limit(1);
    if (membership) throw new NotFoundException();
    throw new ForbiddenException(
      'Change Intelligence operator access required',
    );
  }
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Staff "Update now": merchant picker and the one-off run request. */
@Injectable()
export class StaffChangeService {
  private readonly logger = new Logger(StaffChangeService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly config: ChangeIntelligenceConfig,
    private readonly queue: ChangeWorkQueueService,
    private readonly trigger: ChangeJobTrigger,
  ) {}

  /** Enabled merchants matching business name or owner email, at most 50. */
  async merchants(q?: string): Promise<{ merchants: StaffChangeMerchant[] }> {
    const pattern = q ? `%${escapeLike(q)}%` : null;
    const result = await this.db.execute(sql`
      SELECT m.id, m.public_id, m.business_name, o.email, w.last_success_at,
        w.merchant_id IS NOT NULL AS has_work, ${WORK_PROCESSING_SQL.columns}
      FROM merchants m
      LEFT JOIN LATERAL (
        SELECT u.email FROM merchant_memberships mm JOIN users u ON u.id = mm.user_id
        WHERE mm.merchant_id = m.id AND mm.role = 'owner' ORDER BY mm.created_at, mm.id LIMIT 1
      ) o ON true
      LEFT JOIN merchant_change_work w ON w.merchant_id = m.id ${WORK_PROCESSING_SQL.lateral}
      WHERE ${this.queue.eligible()}
        AND (${pattern}::text IS NULL OR m.business_name ILIKE ${pattern} OR o.email ILIKE ${pattern})
      ORDER BY lower(m.business_name), m.id
      LIMIT ${PICKER_LIMIT}`);
    const rows = result.rows as unknown as Array<
      WorkProcessingRow & {
        id: string;
        public_id: string;
        business_name: string;
        email: string | null;
        last_success_at: string | Date | null;
        has_work: boolean;
      }
    >;
    return {
      merchants: rows.map((row) => ({
        merchantId: row.id,
        publicId: row.public_id,
        businessName: row.business_name,
        ownerEmail: row.email,
        lastSuccessfulUpdateAt: row.last_success_at
          ? new Date(row.last_success_at).toISOString()
          : null,
        processing: processingState(row.has_work ? row : undefined),
      })),
    };
  }

  /**
   * Marks the merchant's work due now and starts one execution of the Changes
   * job. Every use is audited, including `already_running`. The job processes
   * due work with the normal lease and rules, exactly like an hourly run.
   */
  async updateNow(
    userId: string,
    merchantId: string,
    reason: string,
  ): Promise<StaffUpdateNowResponse> {
    const [merchant] = await this.db
      .select({
        id: schema.merchants.id,
        publicId: schema.merchants.publicId,
        isActive: schema.merchants.isActive,
      })
      .from(schema.merchants)
      .where(eq(schema.merchants.id, merchantId));
    if (!merchant || !this.config.isEnabledFor(merchant))
      throw new NotFoundException('Merchant not found or Changes not enabled');

    const status = await this.db.transaction(async (tx) => {
      const outcome = await this.queue.requestUpdateNow(tx, merchantId, userId);
      await tx.insert(schema.auditLogs).values({
        userId,
        action: `change.update_now.${outcome}`,
        entityType: UPDATE_NOW_ENTITY,
        entityId: merchantId,
        metadata: JSON.stringify({ merchantId, reason, status: outcome }),
      });
      return outcome;
    });

    if (status === 'queued') {
      try {
        await this.trigger.start();
      } catch (error) {
        this.logger.error(
          `Update now for ${merchantId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // The work stays due: the next hourly execution processes it.
        throw new ServiceUnavailableException();
      }
    }
    return { status };
  }
}
