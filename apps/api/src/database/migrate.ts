import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { resolve } from 'node:path';
import { createPgPoolConfig } from './database.config';

async function runMigrations() {
  const pool = new Pool(createPgPoolConfig());
  const db = drizzle(pool);

  try {
    await migrate(db, {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });
    console.log('Database migrations applied');
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error('Database migration failed', error);
  process.exit(1);
});
