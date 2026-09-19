import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { globalValidationPipe } from '../common/pipes/validation.pipe';
import { UpdateProfileDto } from './dto/update-profile.dto';

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

describe('Profile updates', () => {
  const validate = (value: unknown): Promise<UpdateProfileDto> =>
    globalValidationPipe.transform(value, { type: 'body', metatype: UpdateProfileDto });

  it('trims names and preserves international characters', async () => {
    await expect(validate({ firstName: '  Ama  ', lastName: '  D’Arcy-Ösei  ' }))
      .resolves.toMatchObject({ firstName: 'Ama', lastName: 'D’Arcy-Ösei' });
  });

  it.each(['', '   ', 'a'.repeat(101), null, 123])(
    'rejects invalid names (%p)',
    async (name) => {
      await expect(validate({ firstName: name })).rejects.toThrow(BadRequestException);
      await expect(validate({ lastName: name })).rejects.toThrow(BadRequestException);
    },
  );

  it('still accepts updates without names', async () => {
    await expect(validate({ primaryCurrency: 'EURC' }))
      .resolves.toMatchObject({ primaryCurrency: 'EURC' });
  });

  it('does not allow contact or verification changes through profile editing', async () => {
    await expect(validate({ email: 'another@example.com', isEmailVerified: true }))
      .rejects.toThrow(BadRequestException);
  });

  it('saves names without changing omitted profile fields', async () => {
    const updatedUser = { id: 'user-1', firstName: 'Ama', lastName: 'Mensah' };
    const set = jest.fn(() => ({
      where: jest.fn(() => ({ returning: jest.fn(async () => [updatedUser]) })),
    }));
    const db = { update: jest.fn(() => ({ set })) };
    const service = new UsersService(db as never);

    await expect(service.updateProfile('user-1', { firstName: 'Ama', lastName: 'Mensah' }))
      .resolves.toEqual(updatedUser);
    expect(set).toHaveBeenCalledWith({
      firstName: 'Ama', lastName: 'Mensah', updatedAt: expect.any(Date),
    });
  });
});
