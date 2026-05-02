import { Global, Logger, Module } from '@nestjs/common';
import { DRIZZLE, DrizzleDB } from './database.provider';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { createPgPoolConfig } from './database.config';

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: async (config: ConfigService): Promise<DrizzleDB> => {
        const pool = new Pool(createPgPoolConfig(config));

        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        Logger.log('Database connected', 'DatabaseModule');

        return drizzle(pool, { schema });
      },
      inject: [ConfigService],
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
