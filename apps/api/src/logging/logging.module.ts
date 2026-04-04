import { Module, RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

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
          pinoHttp: {
            genReqId: (req, res) => {
              const existingId = req.headers['x-correlation-id'];
              if (existingId) return existingId as string;
              const id = randomUUID();
              res.setHeader('x-correlation-id', id);
              return id;
            },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.currentPassword',
                'req.body.newPassword',
                'req.body.confirmPassword',
                'req.body.token',
                'req.body.refreshToken',
                'req.body.privateKey',
                'req.body.seedPhrase',
                'req.body.encryptedKeypair',
              ],
              censor: '[REDACTED]',
            },
            customLogLevel: (_req, res, err) => {
              if (res.statusCode >= 500 || err) return 'error';
              if (res.statusCode >= 400) return 'warn';
              return 'info';
            },
            customSuccessMessage: (req, res) => {
              return `${req.method} ${req.url} ${res.statusCode}`;
            },
            customErrorMessage: (req, res) => {
              return `${req.method} ${req.url} ${res.statusCode}`;
            },
            autoLogging: true,
            ...(isDev && {
              transport: {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                  translateTime: 'HH:MM:ss.l',
                  ignore: 'pid,hostname',
                },
              },
            }),
          },
        };
      },
    }),
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}
