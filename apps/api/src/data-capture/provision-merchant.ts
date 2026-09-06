import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { createPgPoolConfig } from '../database/database.config';
import * as schema from '../database/schema';

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

async function main() {
  const email = argument('email')?.toLowerCase();
  const businessName = argument('business-name');
  if (!email || !businessName || businessName.length > 160) {
    throw new Error(
      'Usage: merchant:provision -- --email user@example.com --business-name "Shop name"',
    );
  }

  const pool = new Pool(createPgPoolConfig());
  const db = drizzle(pool, { schema });
  try {
    const users = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    const user = users[0];
    if (!user || !user.isActive)
      throw new Error('No active registered user matches that email');
    const wallets = await db
      .select()
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.userId, user.id),
          eq(schema.wallets.type, 'routine'),
          eq(schema.wallets.isActive, true),
        ),
      )
      .limit(1);
    const wallet = wallets[0];
    if (!wallet)
      throw new Error('The user does not have an active routine wallet');

    const result = await db.transaction(async (tx) => {
      const existingMembership = await tx
        .select({ merchant: schema.merchants })
        .from(schema.merchantMemberships)
        .innerJoin(
          schema.merchants,
          eq(schema.merchants.id, schema.merchantMemberships.merchantId),
        )
        .where(eq(schema.merchantMemberships.userId, user.id))
        .limit(1);
      if (existingMembership[0])
        return { merchant: existingMembership[0].merchant, created: false };

      const merchantRows = await tx
        .insert(schema.merchants)
        .values({
          publicId: `mrc_${randomUUID().replaceAll('-', '').slice(0, 20)}`,
          businessName,
          receivingWalletId: wallet.id,
          timezone: 'Europe/Berlin',
          displayCurrency: 'EUR',
        })
        .returning();
      await tx.insert(schema.merchantMemberships).values({
        merchantId: merchantRows[0].id,
        userId: user.id,
        role: 'owner',
      });
      return { merchant: merchantRows[0], created: true };
    });

    process.stdout.write(
      `${result.created ? 'Provisioned' : 'Already provisioned'} merchant ${result.merchant.publicId}\n`,
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Provisioning failed'}\n`,
  );
  process.exitCode = 1;
});
