import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

export type DrizzleDB = NodePgDatabase<typeof schema>;

// @Injectable()
// export class DatabaseProvider implements OnModuleInit {
//   private readonly logger = new Logger(DatabaseProvider.name);
//   private pool: Pool;
//   db: NodePgDatabase<typeof schema>;

//   constructor(private config: ConfigService) {}

//   async onModuleInit() {
//     this.pool = new Pool({
//       host: this.config.get<string>('DATABASE_HOST'),
//       port: this.config.get<number>('DATABASE_PORT'),
//       user: this.config.get<string>('DATABASE_USER'),
//       password: this.config.get<string>('DATABASE_PASSWORD'),
//       database: this.config.get<string>('DATABASE_NAME'),
//       ssl: false, // local dev — enable for production
//       max: 10,
//     });

//     // Verify connectivity on startup
//     try {
//       const client = await this.pool.connect();
//       await client.query('SELECT 1');
//       client.release();
//       this.logger.log('Database connected');
//     } catch (err) {
//       this.logger.error('Database connection failed', err);
//       throw err;
//     }

//     this.db = drizzle(this.pool, { schema });
//   }

//   getDb(): NodePgDatabase<typeof schema> {
//     return this.db;
//   }
// }
