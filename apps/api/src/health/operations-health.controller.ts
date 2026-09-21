import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { Public } from '../auth/decorators/public.decorator';
import { OperationsHealthService } from './operations-health.service';

function matches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The operator's view: pending operations, webhook failures, stream activity,
 * worker backlog and — on request — a ledger-to-chain reconciliation.
 *
 * It sits outside the JWT surface because monitoring runs without a user
 * session, and behind a shared token because the numbers describe the whole
 * platform. With no token configured the route does not exist at all, so an
 * unconfigured deployment cannot leak it by accident.
 */
@ApiExcludeController()
@Controller('health/operations')
export class OperationsHealthController {
  constructor(
    private readonly health: OperationsHealthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  async operations(
    @Headers('x-ops-token') token?: string,
    @Query('reconcile') reconcile?: string,
  ) {
    const expected = this.config.get<string>('OPS_MONITORING_TOKEN');
    if (!expected || !token || !matches(token, expected)) {
      // Same answer for "not configured" and "wrong token": neither should
      // tell a caller whether the endpoint is worth attacking.
      throw new NotFoundException();
    }

    return this.health.check({ reconcile: reconcile === 'true' });
  }
}
