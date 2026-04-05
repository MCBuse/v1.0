import { Global, Logger, Module } from '@nestjs/common';
import { DRIZZLE, DrizzleDB } from './database.provider';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: async (config: ConfigService): Promise<DrizzleDB> => {
        const pool = new Pool({
          host: config.get<string>('DATABASE_HOST'),
          port: config.get<number>('DATABASE_PORT'),
          user: config.get<string>('DATABASE_USER'),
          password: config.get<string>('DATABASE_PASSWORD'),
          database: config.get<string>('DATABASE_NAME'),
          ssl: false, // local dev — enable for production
          max: 10,
        });

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
