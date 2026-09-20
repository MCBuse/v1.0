import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { resolve } from 'node:path';
import * as dotenv from 'dotenv';
import * as schema from '../schema';

dotenv.config({ path: resolve(__dirname, '../../../.env') });

export type TestDatabase = NodePgDatabase<typeof schema>;

/**
 * Connects to a real Postgres for integration tests.
 *
 * These tests exist to prove things a mock cannot: unique-index behaviour under
 * concurrency, transactional rollback, and recovery after a simulated restart.
 * A missing database is therefore a hard failure, not a skip — otherwise the
 * suite would report success while proving nothing.
 */
export async function connectTestDatabase(): Promise<{
  db: TestDatabase;
  pool: Pool;
}> {
  const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, max: 8 })
    : new Pool({
        host: process.env.DATABASE_HOST,
        port: Number(process.env.DATABASE_PORT ?? 5432),
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        max: 8,
      });

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw new Error(
      'Integration tests need a reachable Postgres. Check DATABASE_* in apps/api/.env ' +
        `and that the server is running. Underlying error: ${(error as Error).message}`,
    );
  }

  return { db: drizzle(pool, { schema }), pool };
}
