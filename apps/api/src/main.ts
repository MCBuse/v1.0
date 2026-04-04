import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 4000;
  const apiPrefix = configService.get<string>('API_PREFIX') ?? 'api/v1';

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(apiPrefix);

  await app.listen(port);
}
bootstrap();
