import type { PoolConfig } from 'pg';

type EnvSource =
  | Pick<NodeJS.ProcessEnv, string>
  | {
      get<T = string>(key: string): T | undefined;
    };

function getEnv(env: EnvSource, key: string): string | undefined {
  const maybeGet = (env as { get?: unknown }).get;
  if (typeof maybeGet === 'function') {
    const value = maybeGet.call(env, key);
    return value === undefined ? undefined : String(value);
  }

  return env[key];
}

function parseDatabaseSsl(env: EnvSource): PoolConfig['ssl'] {
  const value = getEnv(env, 'DATABASE_SSL') ?? getEnv(env, 'PGSSLMODE');

  if (!value || value === 'false' || value === 'disable') {
    return false;
  }

  if (value === 'true' || value === 'require' || value === 'no-verify') {
    return { rejectUnauthorized: value !== 'no-verify' };
  }

  return false;
}

function parsePoolMax(env: EnvSource): number {
  const value = Number(getEnv(env, 'DATABASE_POOL_MAX') ?? 10);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

export function createPgPoolConfig(env: EnvSource = process.env): PoolConfig {
  const max = parsePoolMax(env);
  const ssl = parseDatabaseSsl(env);
  const databaseUrl = getEnv(env, 'DATABASE_URL');

  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      ssl,
      max,
    };
  }

  return {
    host: getEnv(env, 'DATABASE_HOST'),
    port: Number(getEnv(env, 'DATABASE_PORT')),
    user: getEnv(env, 'DATABASE_USER'),
    password: getEnv(env, 'DATABASE_PASSWORD'),
    database: getEnv(env, 'DATABASE_NAME'),
    ssl,
    max,
  };
}
