import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from './database.provider';
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
        const pool = new Pool({
          ...createPgPoolConfig(config),
          // Postgres cancels any statement running longer than this, so a stuck
          // query can't pin a pool connection. Batch workers that need longer
          // can raise it via DATABASE_STATEMENT_TIMEOUT_MS.
          statement_timeout: Number(
            config.get('DATABASE_STATEMENT_TIMEOUT_MS') ?? 10_000,
          ),
        });

        // pg removes the failed idle client itself. Handle its error event so
        // a dropped connection does not terminate the entire API process.
        pool.on('error', (error: NodeJS.ErrnoException) => {
          // Do not log the error object: pg attaches the client and its
          // connection details to it.
          Logger.error(
            `Idle database connection lost (${error.code ?? 'UNKNOWN'}); removed from pool`,
            'DatabaseModule',
          );
        });

        try {
          await pool.query('SELECT 1');
        } catch (error) {
          await pool.end();
          throw error;
        }
        Logger.log('Database connected', 'DatabaseModule');

        return drizzle(pool, { schema });
      },
      inject: [ConfigService],
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  // Runs after every onModuleDestroy, so services have stopped their timers
  // before the pool goes away.
  async onApplicationShutdown() {
    await (this.db as DrizzleDB & { $client: Pool }).$client.end();
    Logger.log('Database pool closed', 'DatabaseModule');
  }
}
