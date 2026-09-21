import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { createPgPoolConfig } from '../database/database.config';
import * as s from '../database/schema';
async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const [action, id] = args;
  if (
    !['grant', 'revoke', 'enroll', 'unenroll'].includes(action) ||
    !id ||
    args.length !== 2
  )
    throw new Error(
      'Usage: credit:provision -- grant|revoke <registered-user-email> OR enroll|unenroll <merchant-uuid>. This never grants merchant consent.',
    );
  const pool = new Pool(createPgPoolConfig());
  const db = drizzle(pool, { schema: s });
  try {
    await db.transaction(async (tx) => {
      if (action === 'grant' || action === 'revoke') {
        const [user] = await tx
          .select()
          .from(s.users)
          .where(eq(s.users.email, id.toLowerCase()));
        if (!user?.isActive)
          throw new Error('Active registered user not found');
        await tx
          .insert(s.staffPermissions)
          .values({ userId: user.id, active: action === 'grant' })
          .onConflictDoUpdate({
            target: s.staffPermissions.userId,
            set: { active: action === 'grant', updatedAt: new Date() },
          });
        await tx.insert(s.auditLogs).values({
          action: `credit.permission.${action}`,
          entityType: 'user',
          entityId: user.id,
          metadata: JSON.stringify({ source: 'operator_cli' }),
        });
      } else {
        if (!/^[a-f0-9-]{36}$/i.test(id))
          throw new Error('Merchant UUID required');
        const [merchant] = await tx
          .select()
          .from(s.merchants)
          .where(eq(s.merchants.id, id));
        if (!merchant?.isActive) throw new Error('Active merchant not found');
        await tx
          .insert(s.creditPilotEnrollments)
          .values({ merchantId: id, active: action === 'enroll' })
          .onConflictDoUpdate({
            target: s.creditPilotEnrollments.merchantId,
            set: { active: action === 'enroll', updatedAt: new Date() },
          });
        await tx.insert(s.auditLogs).values({
          action: `credit.pilot.${action}`,
          entityType: 'merchant',
          entityId: id,
          metadata: JSON.stringify({ source: 'operator_cli' }),
        });
      }
    });
    console.log(
      'Credit access updated. Merchant pilot consent remains independently controlled by the merchant.',
    );
  } finally {
    await pool.end();
  }
}
void main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Credit provisioning failed');
  process.exitCode = 1;
});
