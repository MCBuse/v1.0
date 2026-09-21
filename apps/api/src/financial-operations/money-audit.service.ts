import { Inject, Injectable, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../database/database.provider';
import * as schema from '../database/schema';
import {
  buildAuthorizationRecord,
  buildSigningRecord,
  type AuditRecord,
  type AuthorizationFact,
  type SigningFact,
} from './money-audit';

/**
 * Writes the money-movement audit trail.
 *
 * An audit write never blocks or fails the money movement it describes: a
 * failure here is logged and swallowed, because refusing a legitimate transfer
 * over a bookkeeping error would be the worse outcome. A *leak* is different —
 * `buildAuthorizationRecord` and `buildSigningRecord` throw before anything is
 * written, and that throw is not caught here by accident: the record simply
 * never reaches the table.
 */
@Injectable()
export class MoneyAuditService {
  private readonly logger = new Logger(MoneyAuditService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async authorization(fact: AuthorizationFact): Promise<void> {
    await this.write(buildAuthorizationRecord(fact));
  }

  async signature(fact: SigningFact): Promise<void> {
    await this.write(buildSigningRecord(fact));
  }

  private async write(record: AuditRecord): Promise<void> {
    try {
      await this.db.insert(schema.auditLogs).values({
        userId: record.userId,
        action: record.action,
        entityType: record.entityType,
        entityId: record.entityId,
        metadata: JSON.stringify(record.metadata),
      });
    } catch (error) {
      this.logger.error(
        `Could not write audit record ${record.action}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
