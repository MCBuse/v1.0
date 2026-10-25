import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { ChangeIntelligenceModule } from './change-intelligence.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? undefined : '.env',
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: (config) => {
        if (process.env.NODE_ENV !== 'test' && !config.DATABASE_URL) {
          const required = [
            'DATABASE_HOST',
            'DATABASE_PORT',
            'DATABASE_USER',
            'DATABASE_PASSWORD',
            'DATABASE_NAME',
          ];
          const missing = required.filter(
            (key) => config[key] === undefined || config[key] === '',
          );
          if (missing.length)
            throw new Error(
              `Changes worker requires DATABASE_URL or complete database fields. Missing: ${missing.join(', ')}`,
            );
        }
        // One merchant at a time: a low pool is enough (plan §8).
        return {
          DATABASE_POOL_MAX: '3',
          DATABASE_STATEMENT_TIMEOUT_MS: '60000',
          ...config,
        };
      },
    }),
    DatabaseModule,
    ChangeIntelligenceModule,
  ],
})
export class ChangeWorkerModule {}
