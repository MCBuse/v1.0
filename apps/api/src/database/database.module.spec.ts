import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DatabaseModule } from './database.module';
import { DRIZZLE, type DrizzleDB } from './database.provider';

describe('DatabaseModule pool lifecycle', () => {
  const providers = Reflect.getMetadata('providers', DatabaseModule) as Array<{
    provide: symbol;
    useFactory: (config: ConfigService) => Promise<DrizzleDB>;
  }>;
  const createDatabase = providers.find(
    (p) => p.provide === DRIZZLE,
  )!.useFactory;

  beforeEach(() => {
    jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('handles repeated idle timeouts without throwing or logging client details', async () => {
    jest
      .spyOn(Pool.prototype, 'query')
      .mockResolvedValue({ rows: [] } as never);
    const db = await createDatabase(new ConfigService({}));
    const pool = (db as DrizzleDB & { $client: Pool }).$client;
    const error = Object.assign(new Error('read ETIMEDOUT'), {
      code: 'ETIMEDOUT',
      client: { password: 'must-not-be-logged' },
    });

    expect(() => {
      pool.emit('error', error);
      pool.emit('error', error);
    }).not.toThrow();
    expect(Logger.error).toHaveBeenCalledTimes(2);
    expect(Logger.error).toHaveBeenCalledWith(
      'Idle database connection lost (ETIMEDOUT); removed from pool',
      'DatabaseModule',
    );
    await new DatabaseModule(db).onApplicationShutdown();
    expect(pool.ended).toBe(true);
  });

  it('closes the pool and preserves a failed startup probe', async () => {
    const error = new Error('database unavailable');
    jest.spyOn(Pool.prototype, 'query').mockRejectedValue(error as never);
    const end = jest.spyOn(Pool.prototype, 'end');

    await expect(createDatabase(new ConfigService({}))).rejects.toBe(error);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
