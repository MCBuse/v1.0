import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as s from '../database/schema';

export type StaffPermission = 'credit_analyst' | 'change_intelligence_operator';

/**
 * Active staff permissions of an active user. Every staff check goes through
 * this: a revoked row or a deactivated user takes effect on the next request.
 */
export async function activeStaffPermissions(
  db: NodePgDatabase<typeof s>,
  userId: string,
): Promise<StaffPermission[]> {
  const rows = await db
    .select({ permission: s.staffPermissions.permission })
    .from(s.staffPermissions)
    .innerJoin(s.users, eq(s.users.id, s.staffPermissions.userId))
    .where(
      and(
        eq(s.staffPermissions.userId, userId),
        eq(s.staffPermissions.active, true),
        eq(s.users.isActive, true),
      ),
    );
  return rows.map((row) => row.permission);
}
