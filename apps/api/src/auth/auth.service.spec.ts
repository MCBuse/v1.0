import { ConflictException } from '@nestjs/common';
import * as schema from '../database/schema';
import { AuthService } from './auth.service';

function createService(usernameAvailable = true) {
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const tx = {
    insert: jest.fn((table: unknown) => ({
      values: jest.fn((values: Record<string, unknown>) => {
        inserted.push({ table, values });
        return {
          returning: jest.fn().mockResolvedValue([
            { id: table === schema.users ? 'user-id' : 'organization-id' },
          ]),
        };
      }),
    })),
  };
  const db = {
    transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx)),
  };
  const usersService = {
    validateUsername: jest.fn((username: string) => username.toLowerCase()),
    checkUsernameAvailability: jest.fn().mockResolvedValue({
      username: 'issuer_user',
      available: usernameAvailable,
      suggestions: usernameAvailable ? [] : ['issuer_user1'],
    }),
  };
  const service = new AuthService(
    usersService as never,
    {} as never,
    {} as never,
    {} as never,
    db as never,
    {} as never,
  );
  jest.spyOn(service as never, 'issueTokens' as never).mockResolvedValue({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
  } as never);

  return { service, db, inserted, usersService };
}

const signupDetails = {
  organizationName: 'Northstar Labs',
  firstName: 'Jane',
  lastName: 'Doe',
  username: 'issuer_user',
  email: 'JANE@EXAMPLE.COM',
  password: 'P@ssw0rd!',
};

describe('AuthService issuer signup', () => {
  it('creates an issuer account, pending organization, and issuer-admin membership atomically', async () => {
    const { service, db, inserted } = createService();

    await expect(service.signupIssuer(signupDetails)).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(3);
    expect(inserted[0]).toMatchObject({
      table: schema.users,
      values: {
        email: 'jane@example.com',
        username: 'issuer_user',
        firstName: 'Jane',
        lastName: 'Doe',
      },
    });
    expect(inserted[1]).toMatchObject({
      table: schema.issuerOrganizations,
      values: {
        legalName: 'Northstar Labs',
        verificationStatus: 'pending',
        lifecycleStatus: 'active',
      },
    });
    expect(inserted[1].values.slug).toEqual(expect.stringMatching(/^northstar-labs-[\da-f]{8}$/));
    expect(inserted[2]).toEqual({
      table: schema.issuerMemberships,
      values: {
        organizationId: 'organization-id',
        userId: 'user-id',
        role: 'issuer_admin',
        status: 'active',
      },
    });
  });

  it('rejects an unavailable username before opening a transaction', async () => {
    const { service, db } = createService(false);

    await expect(service.signupIssuer(signupDetails)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });
});