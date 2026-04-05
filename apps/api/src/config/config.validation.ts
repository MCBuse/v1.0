import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  PORT: number;

  @IsString()
  API_PREFIX: string;

  @IsString()
  DATABASE_HOST: string;

  @IsNumber()
  DATABASE_PORT: number;

  @IsString()
  DATABASE_USER: string;

  @IsString()
  DATABASE_PASSWORD: string;

  @IsString()
  DATABASE_NAME: string;

  @IsOptional()
  @IsString()
  JWT_SECRET?: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRATION?: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRATION?: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '7d';

  @IsString()
  @IsOptional()
  OTP_PROVIDER: string = 'mock';

  // Twilio vars — only required when OTP_PROVIDER=twilio
  @IsString()
  @IsOptional()
  TWILIO_ACCOUNT_SID?: string;

  @IsString()
  @IsOptional()
  TWILIO_AUTH_TOKEN?: string;

  @IsString()
  @IsOptional()
  TWILIO_VERIFY_SERVICE_SID?: string;

  @IsString()
  SOLANA_RPC_URL: string;

  @IsString()
  SOLANA_NETWORK: string;

  @IsString()
  SOLANA_KEYPAIR_ENCRYPTION_KEY: string;

  @IsString()
  ONRAMP_PROVIDER: string;

  @IsString()
  OFFRAMP_PROVIDER: string;

  @IsString()
  SWAP_PROVIDER: string;

  @IsOptional()
  @IsString()
  CIRCLE_API_KEY?: string;

  @IsNumber()
  THROTTLE_TTL: number;

  @IsNumber()
  THROTTLE_LIMIT: number;
}

const KNOWN_PLACEHOLDER_SECRETS = [
  'change_me_in_production_min_32_chars',
  'change_me_in_production_different_min_32_chars',
  'change-me-in-production',
  'your_jwt_secret_here',
  'secret',
  'mysecret',
];

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors.map((error) => {
      const constraints = error.constraints
        ? Object.values(error.constraints).join(', ')
        : 'unknown constraint';
      return `  - ${error.property}: ${constraints}`;
    });
    throw new Error(
      `Configuration validation failed:\n${messages.join('\n')}`,
    );
  }

  // In production, reject known placeholder secrets that pass length checks
  if (validatedConfig.NODE_ENV === 'production') {
    const secretFields = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;
    for (const field of secretFields) {
      const value = config[field] as string;
      if (KNOWN_PLACEHOLDER_SECRETS.includes(value)) {
        throw new Error(
          `SECURITY: ${field} is set to a known placeholder value. Generate a proper secret before deploying to production.`,
        );
      }
    }
  }

  return validatedConfig;
}
