import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { DRIZZLE } from './database.provider';
import type { DrizzleDB } from './database.provider';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { createPgPoolConfig } from './database.config';

@Injectable()
class DatabasePoolLifecycle implements OnModuleDestroy {
  constructor(@Inject(Pool) private readonly pool: Pool) {}

  onModuleDestroy() {
    return this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: Pool,
      useFactory: async (config: ConfigService): Promise<Pool> => {
        const pool = new Pool(createPgPoolConfig(config));

        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        Logger.log('Database connected', 'DatabaseModule');

        return pool;
      },
      inject: [ConfigService],
    },
    {
      provide: DRIZZLE,
      useFactory: (pool: Pool): DrizzleDB => drizzle(pool, { schema }),
      inject: [Pool],
    },
    DatabasePoolLifecycle,
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
