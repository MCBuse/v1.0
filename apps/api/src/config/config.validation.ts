import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
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
  @IsOptional()
  HOST?: string;

  @IsString()
  API_PREFIX: string;

  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  @IsString()
  @IsOptional()
  DATABASE_HOST?: string;

  @IsNumber()
  @IsOptional()
  DATABASE_PORT?: number;

  @IsString()
  @IsOptional()
  DATABASE_USER?: string;

  @IsString()
  @IsOptional()
  DATABASE_PASSWORD?: string;

  @IsString()
  @IsOptional()
  DATABASE_NAME?: string;

  @IsString()
  @IsOptional()
  DATABASE_SSL?: string;

  @IsString()
  @IsOptional()
  DATABASE_SSL_CA?: string;

  @IsString()
  @IsOptional()
  DATABASE_SSL_CA_BASE64?: string;

  @IsNumber()
  @IsOptional()
  DATABASE_POOL_MAX?: number;

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

  /** Additional wallet-encryption key versions, retained until rotation is verified. */
  @IsOptional()
  @IsString()
  SOLANA_KEYPAIR_ENCRYPTION_KEY_V2?: string;

  @IsOptional()
  @IsString()
  SOLANA_KEYPAIR_ENCRYPTION_KEY_V3?: string;

  /** Which key version seals newly written wallet records. Defaults to the highest. */
  @IsOptional()
  @IsString()
  SOLANA_KEYPAIR_ENCRYPTION_KEY_CURRENT?: string;

  /** Devnet treasury signing key, held separately from the wallet-encryption keys. */
  @IsOptional()
  @IsString()
  SOLANA_TREASURY_SECRET_KEY?: string;

  @IsString()
  ONRAMP_PROVIDER: string;

  @IsString()
  OFFRAMP_PROVIDER: string;

  @IsString()
  SWAP_PROVIDER: string;

  @IsOptional()
  @IsString()
  TRANSFER_PROVIDER?: string;

  @IsOptional()
  @IsString()
  MERCHANT_PORTAL_ENABLED?: string;

  @IsOptional()
  @IsString()
  MERCHANT_GENERAL_ANALYTICS_ENABLED?: string;

  @IsOptional()
  @IsString()
  MERCHANT_INTELLIGENCE_ENABLED?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  MERCHANT_INTELLIGENCE_STALE_AFTER_MINUTES?: number;

  @IsOptional()
  @IsString()
  MERCHANT_INTELLIGENCE_ALLOWLIST?: string;

  @IsOptional()
  @IsString()
  MERCHANT_AI_NARRATION_ENABLED?: string;

  @IsOptional()
  @IsString()
  GROQ_API_KEY?: string;

  @IsOptional()
  @IsString()
  PRODUCT_IMAGE_BUCKET?: string;

  @IsOptional()
  @IsString()
  PRODUCT_IMAGE_PUBLIC_BASE_URL?: string;

  @IsOptional()
  @IsString()
  CIRCLE_API_KEY?: string;

  @IsOptional()
  @IsString()
  CIRCLE_BASE_URL?: string;

  @IsOptional()
  @IsString()
  CIRCLE_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  CIRCLE_SETTLEMENT_MODE?: string; // 'polling' (default) | 'webhook'

  /** MoonPay widget (optional unless using POST /onramp/sessions) */
  @IsOptional()
  @IsString()
  MOONPAY_PUBLIC_KEY?: string;

  @IsOptional()
  @IsString()
  MOONPAY_API_KEY?: string;

  @IsOptional()
  @IsString()
  MOONPAY_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  MOONPAY_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  MOONPAY_WEBHOOK_TOLERANCE_SECONDS?: string;

  @IsOptional()
  @IsString()
  MOONPAY_BASE_URL?: string;

  @IsOptional()
  @IsString()
  MOONPAY_SELL_BASE_URL?: string;

  @IsOptional()
  @IsString()
  MOONPAY_API_BASE_URL?: string;

  @IsOptional()
  @IsString()
  MOONPAY_ENVIRONMENT?: string;

  @IsOptional()
  @IsString()
  MOONPAY_USDC_CURRENCY_CODE?: string;

  /** Minimum EUR amount for MoonPay session (default 20) */
  @IsOptional()
  @IsString()
  MOONPAY_MIN_EUR?: string;

  @IsOptional()
  @IsString()
  SOLANA_USDC_MINT?: string;

  @IsOptional()
  @IsString()
  APP_REDIRECT_URL?: string;

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
    throw new Error(`Configuration validation failed:\n${messages.join('\n')}`);
  }

  if (!validatedConfig.DATABASE_URL) {
    const requiredDatabaseFields = [
      'DATABASE_HOST',
      'DATABASE_PORT',
      'DATABASE_USER',
      'DATABASE_PASSWORD',
      'DATABASE_NAME',
    ] as const;

    const missingDatabaseFields = requiredDatabaseFields.filter(
      (field) =>
        validatedConfig[field] === undefined || validatedConfig[field] === '',
    );

    if (missingDatabaseFields.length > 0) {
      throw new Error(
        `Configuration validation failed:\n  - database: set DATABASE_URL or all of ${requiredDatabaseFields.join(', ')}. Missing: ${missingDatabaseFields.join(', ')}`,
      );
    }
  }

  // In production, reject known placeholder secrets that pass length checks
  if (validatedConfig.NODE_ENV === Environment.Production) {
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
