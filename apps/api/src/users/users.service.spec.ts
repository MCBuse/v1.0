import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';

function serviceWithRows(rows: { id: string }[] = []) {
  const db = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => rows),
        })),
      })),
    })),
  };

  return new UsersService(db as never);
}

describe('UsersService username helpers', () => {
  it('normalizes usernames for storage', () => {
    const service = serviceWithRows();

    expect(service.normalizeUsername(' @Fred_123 ')).toBe('fred_123');
  });

  it('validates supported username characters and length', () => {
    const service = serviceWithRows();

    expect(service.validateUsername('@kwesi_obeng')).toBe('kwesi_obeng');
    expect(() => service.validateUsername('ab')).toThrow(BadRequestException);
    expect(() => service.validateUsername('fred-name')).toThrow(BadRequestException);
  });

  it('returns availability for unused usernames', async () => {
    const service = serviceWithRows();

    await expect(service.checkUsernameAvailability('ama45')).resolves.toEqual({
      username: 'ama45',
      available: true,
      suggestions: [],
    });
  });

  it('protects reserved usernames and returns suggestions', async () => {
    const service = serviceWithRows();

    await expect(service.checkUsernameAvailability('admin')).resolves.toEqual({
      username: 'admin',
      available: false,
      suggestions: ['admin1', 'admin2', 'admin3'],
    });
  });
});
