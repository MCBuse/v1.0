import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  HTTP_LOG_ERROR,
  LoggableResponse,
} from '../../logging/http-logger.config';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId = String(
      response.getHeader('x-correlation-id') ?? 'unknown',
    );
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Build safe response — no internal details for 5xx
    let message: string | string[];
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (status >= 500) {
        message = 'An unexpected error occurred. Please try again later.';
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res.message as string | string[]) ?? exception.message;
      } else {
        message = exceptionResponse;
      }
    } else {
      message = 'An unexpected error occurred. Please try again later.';
    }

    const loggableResponse = response as LoggableResponse;
    loggableResponse.locals ??= {};
    if (status >= 500) {
      loggableResponse.err =
        exception instanceof Error ? exception : new Error(String(exception));
    } else {
      loggableResponse.locals[HTTP_LOG_ERROR] = Array.isArray(message)
        ? message.join('; ')
        : message;
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
