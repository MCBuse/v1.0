import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { DatabaseProvider } from '../database/database.provider';
import { sql } from 'drizzle-orm';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly dbProvider: DatabaseProvider) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check — DB connectivity, uptime, version' })
  async check() {
    let dbStatus = 'ok';
    try {
      await this.dbProvider.getDb().execute(sql`SELECT 1`);
    } catch {
      dbStatus = 'error';
    }

    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV ?? 'unknown',
      services: {
        database: dbStatus,
      },
    };
  }
}
