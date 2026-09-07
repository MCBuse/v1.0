import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { globalValidationPipe } from './common/pipes/validation.pipe';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { setupSwagger } from './common/swagger.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 4000;
  const host = configService.get<string>('HOST') ?? '0.0.0.0';
  const apiPrefix = configService.get<string>('API_PREFIX') ?? 'api/v1';

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(globalValidationPipe);

  app.useGlobalFilters(new HttpExceptionFilter());

  setupSwagger(app);

  await app.listen(port, host);
}
void bootstrap();
