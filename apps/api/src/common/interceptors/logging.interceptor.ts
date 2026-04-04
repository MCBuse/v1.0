import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Logger } from 'nestjs-pino';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const now = Date.now();

    const correlationId = res.getHeader('x-correlation-id') as string;
    const handler = context.getHandler().name;
    const controller = context.getClass().name;

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - now;
          // Extract userId from request if auth guard has populated it
          const userId = (req as unknown as Record<string, unknown>).user
            ? ((req as unknown as Record<string, { id: string }>).user?.id ?? 'anonymous')
            : 'anonymous';

          this.logger.log({
            correlationId,
            userId,
            controller,
            handler,
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration,
          });
        },
        error: (err: Error) => {
          const duration = Date.now() - now;
          const userId = (req as unknown as Record<string, unknown>).user
            ? ((req as unknown as Record<string, { id: string }>).user?.id ?? 'anonymous')
            : 'anonymous';

          this.logger.warn({
            correlationId,
            userId,
            controller,
            handler,
            method: req.method,
            url: req.url,
            duration,
            error: err.message,
          });
        },
      }),
    );
  }
}
