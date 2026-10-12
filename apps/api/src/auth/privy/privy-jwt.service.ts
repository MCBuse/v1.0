import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface PrivyTokenClaims extends JWTPayload {
  /** Privy DID, e.g. `did:privy:cm123...` */
  sub: string;
  /** Privy app ID — should match our configured app */
  aud: string | string[];
  /** Always `privy.io` */
  iss: string;
  /** Session ID */
  sid?: string;
}

@Injectable()
export class PrivyJwtService {
  private readonly logger = new Logger(PrivyJwtService.name);
  private readonly appId: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(config: ConfigService) {
    this.appId = config.getOrThrow<string>('PRIVY_APP_ID');
    this.jwks = createRemoteJWKSet(
      new URL(`https://auth.privy.io/api/v1/apps/${this.appId}/jwks.json`),
      { cacheMaxAge: 10 * 60 * 1000 }, // 10 min cache
    );
  }

  /** Verify a Privy access token and return its claims. Throws 401 on any failure. */
  async verify(accessToken: string): Promise<PrivyTokenClaims> {
    try {
      const { payload } = await jwtVerify(accessToken, this.jwks, {
        issuer: 'privy.io',
        audience: this.appId,
      });
      if (!payload.sub) {
        throw new Error('Privy token missing sub claim');
      }
      return payload as PrivyTokenClaims;
    } catch (err) {
      this.logger.warn(
        'Privy token verification failed: ' +
          (err instanceof Error ? err.message : String(err)),
      );
      throw new UnauthorizedException('Invalid Privy access token');
    }
  }
}
