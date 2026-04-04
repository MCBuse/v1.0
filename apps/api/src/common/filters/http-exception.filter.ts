import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId = response.getHeader('x-correlation-id') as string;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Log the full error internally
    if (status >= 500) {
      this.logger.error(
        {
          correlationId,
          method: request.method,
          url: request.url,
          statusCode: status,
          error: exception instanceof Error ? exception.message : String(exception),
          stack: exception instanceof Error ? exception.stack : undefined,
        },
        'Unhandled exception',
      );
    } else {
      this.logger.warn(
        {
          correlationId,
          method: request.method,
          url: request.url,
          statusCode: status,
        },
        'HTTP exception',
      );
    }

    // Build safe response — no internal details for 5xx
    let message: string | string[];
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (status >= 500) {
        message = 'An unexpected error occurred. Please try again later.';
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res.message as string | string[]) ?? exception.message;
      } else {
        message = exceptionResponse as string;
      }
    } else {
      message = 'An unexpected error occurred. Please try again later.';
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      correlationId,
      path: request.url,
    });
  }
}
