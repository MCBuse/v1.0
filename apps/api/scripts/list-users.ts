import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from '../src/database/schema';

const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'mcbuse_dev',
});

const db = drizzle(pool, { schema });

async function listUsers() {
  const users = await db.select().from(schema.users).where(eq(schema.users.isActive, true)).limit(10);

  console.log(`Found ${users.length} active users:\n`);

  for (const user of users) {
    console.log(`📧 ${user.email}`);
    console.log(`   @${user.username} - ${user.firstName} ${user.lastName}`);
    console.log('');
  }

  await pool.end();
}

listUsers();
