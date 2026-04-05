import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../../users/users.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private readonly usersService: UsersService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    // Always run bcrypt even when user not found to prevent timing attacks
    const dummyHash = '$2b$12$invalidhashfortimingprotectiononly000000000000000000000';
    const passwordHash = user?.passwordHash ?? dummyHash;

    if (!user || !user.isActive) {
      await bcrypt.compare(password, dummyHash);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check lockout before bcrypt (fast path)
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily locked. Try again later.');
    }

    const valid = await bcrypt.compare(password, passwordHash);
    if (!valid) {
      await this.usersService.recordFailedLogin(user.id);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Successful login — reset counter
    await this.usersService.resetFailedLogins(user.id);
    return { id: user.id, email: user.email };
  }
}
