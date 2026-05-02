import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(__dirname, '.env') });

const dbCredentials = process.env.DATABASE_URL
  ? {
      url: process.env.DATABASE_URL,
    }
  : {
      host: process.env.DATABASE_HOST!,
      port: Number(process.env.DATABASE_PORT!),
      user: process.env.DATABASE_USER!,
      password: process.env.DATABASE_PASSWORD!,
      database: process.env.DATABASE_NAME!,
      ssl: process.env.DATABASE_SSL === 'true',
    };

export default {
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials,
} satisfies Config;
