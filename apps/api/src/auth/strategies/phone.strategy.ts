import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../../users/users.service';

/**
 * Phone-number counterpart to `LocalStrategy`. Registered as the `phone-local`
 * passport strategy. Keep timing behaviour identical so an attacker cannot
 * distinguish a missing phone from a wrong password.
 */
@Injectable()
export class PhoneStrategy extends PassportStrategy(Strategy, 'phone-local') {
  constructor(private readonly usersService: UsersService) {
    super({ usernameField: 'phone' });
  }

  async validate(phone: string, password: string) {
    const user = await this.usersService.findByPhone(phone);

    // Pre-computed dummy hash (cost 12) to keep timing constant on miss.
    const dummyHash =
      '$2b$12$8.IVpgqn2SK6YkloJm3W2eDHtboPy7iFg6Cxl5NXNShGBK7rfQtB2';
    const passwordHash = user?.passwordHash ?? dummyHash;

    if (!user || !user.isActive) {
      await bcrypt.compare(password, dummyHash);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily locked. Try again later.');
    }

    const valid = await bcrypt.compare(password, passwordHash);
    if (!valid) {
      await this.usersService.recordFailedLogin(user.id);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.usersService.resetFailedLogins(user.id);
    return { id: user.id, email: user.email };
  }
}
