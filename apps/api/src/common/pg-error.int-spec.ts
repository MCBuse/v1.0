import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import {
  connectTestDatabase,
  type TestDatabase,
} from '../database/testing/test-database';
import * as schema from '../database/schema';
import { isUniqueViolation, pgError } from './pg-error';

/**
 * Must run against a real driver: a hand-made `{ code: '23505' }` mock passes
 * even when the production error shape (DrizzleQueryError → cause) doesn't.
 */
describe('pgError (integration)', () => {
  let db: TestDatabase;
  let pool: Pool;
  const username = `pgerr${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    ({ db, pool } = await connectTestDatabase());
  });

  afterAll(async () => {
    await db.delete(schema.users).where(eq(schema.users.username, username));
    await pool.end();
  });

  it('detects a unique violation and its constraint through drizzle', async () => {
    const row = {
      email: `${username}@mcbuse.test`,
      passwordHash: 'integration-test-not-a-real-hash',
      firstName: 'Pg',
      lastName: 'Error',
      username,
    };
    await db.insert(schema.users).values(row);

    const err: unknown = await db
      .insert(schema.users)
      .values({ ...row, email: `other-${username}@mcbuse.test` })
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(isUniqueViolation(err)).toBe(true);
    expect(pgError(err)?.constraint).toBe('users_username_unique');
  });
});
