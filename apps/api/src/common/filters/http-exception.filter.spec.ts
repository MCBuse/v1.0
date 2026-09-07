import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { HTTP_LOG_ERROR } from '../../logging/http-logger.config';
import { HttpExceptionFilter } from './http-exception.filter';

interface MockResponse extends Partial<Response> {
  err?: Error;
  locals: Record<string, unknown>;
}

function createContext() {
  const request = {
    method: 'POST',
    url: '/api/v1/auth/login',
  } as Request;
  const response: MockResponse = {
    getHeader: jest.fn().mockReturnValue('request-id'),
    json: jest.fn(),
    locals: {},
    status: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ArgumentsHost;

  return { host, response };
}

describe('HttpExceptionFilter', () => {
  it('passes a safe 4xx reason to the request logger', () => {
    const { host, response } = createContext();

    new HttpExceptionFilter().catch(
      new BadRequestException('Invalid credentials'),
      host,
    );

    expect(response.locals[HTTP_LOG_ERROR]).toBe('Invalid credentials');
    expect(response.err).toBeUndefined();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'request-id',
        message: 'Invalid credentials',
        statusCode: 400,
      }),
    );
  });

  it('passes the real 5xx error to Pino while returning a sanitized response', () => {
    const { host, response } = createContext();
    const error = new Error('Database password was rejected');

    new HttpExceptionFilter().catch(error, host);

    expect(response.err).toBe(error);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'request-id',
        message: 'An unexpected error occurred. Please try again later.',
        statusCode: 500,
      }),
    );
  });
});
