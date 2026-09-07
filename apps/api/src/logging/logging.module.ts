import { Module, RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createPinoHttpOptions } from './http-logger.config';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isDev = config.get('NODE_ENV') === 'development';
        return {
          forRoutes: [
            { path: '/', method: RequestMethod.ALL },
            { path: '/{*path}', method: RequestMethod.ALL },
          ],
          pinoHttp: createPinoHttpOptions(isDev),
        };
      },
    }),
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}
