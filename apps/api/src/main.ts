import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { globalValidationPipe } from './common/pipes/validation.pipe';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { setupSwagger } from './common/swagger.config';

function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== 'http:') return false;
    if (hostname === 'localhost') return true;

    const octets = hostname.split('.');
    if (
      octets.length !== 4 ||
      !octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
    ) {
      return false;
    }

    const first = Number(octets[0]);
    const second = Number(octets[1]);
    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  // Run onModuleDestroy / onApplicationShutdown on SIGTERM so Cloud Run
  // scale-in drains timers and the pg pool instead of killing them mid-flight.
  app.enableShutdownHooks();
  // Cloud Run's Google Front End is one proxy hop; trust it so req.ip (and the
  // throttler) sees the real client address.
  app.set('trust proxy', 1);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 4000;
  const host = configService.get<string>('HOST') ?? '0.0.0.0';
  const apiPrefix = configService.get<string>('API_PREFIX') ?? 'api/v1';
  const corsOrigins = (configService.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      const allowed =
        !origin ||
        corsOrigins.includes(origin) ||
        (!isProduction && isLocalDevelopmentOrigin(origin));
      callback(null, allowed);
    },
  });
  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(globalValidationPipe);

  app.useGlobalFilters(new HttpExceptionFilter());

  // if (process.env.NODE_ENV !== 'production') {
  //   setupSwagger(app);
  // }

  await app.listen(port, host);
}
void bootstrap();
