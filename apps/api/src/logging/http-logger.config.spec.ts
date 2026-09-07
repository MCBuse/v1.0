import { EventEmitter } from 'events';
import pinoHttp from 'pino-http';
import {
  HTTP_LOG_ERROR,
  createHttpLogMessage,
  createHttpLogRecord,
  createPinoHttpOptions,
} from './http-logger.config';
import type { LoggableRequest, LoggableResponse } from './http-logger.config';

function request(overrides: Partial<LoggableRequest> = {}): LoggableRequest {
  return {
    headers: {},
    id: '0c19aa4e-b847-4e36-b3fe-65ba73a385f9',
    method: 'POST',
    url: '/api/v1/auth/login?token=secret',
    ...overrides,
  } as LoggableRequest;
}

function response(overrides: Partial<LoggableResponse> = {}): LoggableResponse {
  return {
    locals: {},
    setHeader: jest.fn(),
    statusCode: 200,
    ...overrides,
  } as unknown as LoggableResponse;
}

describe('HTTP logger configuration', () => {
  it('emits one request record without headers or body data', () => {
    const lines: string[] = [];
    const logger = pinoHttp(createPinoHttpOptions(false), {
      write: (line: string) => lines.push(line),
    });
    const req = request({
      headers: { authorization: 'Bearer secret-token' },
    });
    (req as LoggableRequest & { body: unknown }).body = {
      password: 'secret-password',
    };
    const res = Object.assign(new EventEmitter(), response());

    logger(req, res);
    res.emit('finish');

    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(record).toMatchObject({
      method: 'POST',
      path: '/api/v1/auth/login',
      statusCode: 200,
    });
    expect(record).not.toHaveProperty('req');
    expect(record).not.toHaveProperty('res');
    expect(JSON.stringify(record)).not.toContain('secret-token');
    expect(JSON.stringify(record)).not.toContain('secret-password');
  });

  it('creates a compact successful request record without request or response data', () => {
    const req = request({ user: { id: 'user-123' } });
    const res = response();

    expect(createHttpLogRecord(req, res, 633)).toEqual({
      requestId: '0c19aa4e-b847-4e36-b3fe-65ba73a385f9',
      method: 'POST',
      path: '/api/v1/auth/login',
      statusCode: 200,
      responseTime: 633,
      userId: 'user-123',
    });
  });

  it('formats the compact local success message', () => {
    expect(createHttpLogMessage(request(), response(), 633)).toBe(
      'POST /api/v1/auth/login → 200 in 633ms (0c19aa4e)',
    );
  });

  it('includes a safe single-line reason for 4xx responses', () => {
    const res = response({
      locals: { [HTTP_LOG_ERROR]: 'Invalid\ncredentials' },
      statusCode: 401,
    });

    expect(createHttpLogMessage(request(), res, 32)).toBe(
      'POST /api/v1/auth/login → 401 in 32ms (0c19aa4e) — Invalid credentials',
    );
  });

  it('keeps the real error object and stack for 5xx records', () => {
    const error = new Error('Database unavailable');
    const record = createHttpLogRecord(
      request(),
      response({ statusCode: 500 }),
      41,
      error,
    );

    expect(record.error).toBe(error);
    expect(record.error?.stack).toContain('Database unavailable');
    expect(
      createHttpLogMessage(request(), response({ statusCode: 500 }), 41, error),
    ).toBe(
      'POST /api/v1/auth/login → 500 in 41ms (0c19aa4e) — Database unavailable',
    );
  });

  it('reuses and echoes a supplied correlation ID', () => {
    const options = createPinoHttpOptions(false);
    const req = request({
      headers: { 'x-correlation-id': 'client-request-id' },
    });
    const setHeader = jest.fn();
    const res = response({ setHeader });

    expect(options.genReqId?.(req, res)).toBe('client-request-id');
    expect(setHeader).toHaveBeenCalledWith(
      'x-correlation-id',
      'client-request-id',
    );
  });

  it('generates and echoes a correlation ID when none is supplied', () => {
    const options = createPinoHttpOptions(false);
    const setHeader = jest.fn();
    const res = response({ setHeader });
    const id = options.genReqId?.(request({ headers: {} }), res);

    expect(id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(setHeader).toHaveBeenCalledWith('x-correlation-id', id);
  });

  it('keeps request bindings quiet and only enables pretty transport in development', () => {
    const development = createPinoHttpOptions(true);
    const production = createPinoHttpOptions(false);

    expect(development.quietReqLogger).toBe(true);
    expect(development.quietResLogger).toBe(true);
    expect(development.autoLogging).toBe(true);
    expect(development.transport).toBeDefined();
    expect(production.transport).toBeUndefined();
  });
});
