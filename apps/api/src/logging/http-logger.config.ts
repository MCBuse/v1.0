import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { startTime, type Options } from 'pino-http';

export const HTTP_LOG_ERROR = 'httpLogError';

interface AuthenticatedUser {
  id?: string;
}

export interface LoggableRequest extends IncomingMessage {
  originalUrl?: string;
  user?: AuthenticatedUser;
}

export interface LoggableResponse extends ServerResponse {
  locals?: Record<string, unknown> & {
    [HTTP_LOG_ERROR]?: string;
  };
}

export interface HttpLogRecord {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  userId?: string;
  error?: Error;
}

function requestIdFromHeader(req: LoggableRequest): string | undefined {
  const header = req.headers['x-correlation-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.trim() || undefined;
}

function requestIdForLog(req: LoggableRequest): string {
  if (typeof req.id === 'string' || typeof req.id === 'number') {
    return String(req.id);
  }
  return requestIdFromHeader(req) ?? 'unknown';
}

function requestPath(req: LoggableRequest): string {
  const url = req.originalUrl ?? req.url ?? '/';
  return url.split('?', 1)[0] || '/';
}

function compactMessage(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function shortRequestId(requestId: string): string {
  return compactMessage(requestId).slice(0, 8) || 'unknown';
}

function withoutRequestId(
  record: HttpLogRecord,
): Omit<HttpLogRecord, 'requestId'> {
  const fields: Omit<HttpLogRecord, 'requestId'> = {
    method: record.method,
    path: record.path,
    statusCode: record.statusCode,
    responseTime: record.responseTime,
  };
  if (record.userId) fields.userId = record.userId;
  if (record.error) fields.error = record.error;
  return fields;
}

function responseTimeFrom(value: unknown): number {
  if (typeof value !== 'object' || value === null) return 0;
  const responseTime = (value as Record<string, unknown>).responseTime;
  return typeof responseTime === 'number' ? responseTime : 0;
}

export function createHttpLogRecord(
  req: LoggableRequest,
  res: LoggableResponse,
  responseTime: number,
  error?: Error,
): HttpLogRecord {
  const record: HttpLogRecord = {
    requestId: requestIdForLog(req),
    method: req.method ?? 'UNKNOWN',
    path: requestPath(req),
    statusCode: res.statusCode,
    responseTime,
  };

  if (req.user?.id) record.userId = req.user.id;
  if (error) record.error = error;

  return record;
}

export function createHttpLogMessage(
  req: LoggableRequest,
  res: LoggableResponse,
  responseTime: number,
  error?: Error,
): string {
  const record = createHttpLogRecord(req, res, responseTime);
  const reason = error?.message ?? res.locals?.[HTTP_LOG_ERROR];
  const summary = `${record.method} ${record.path} → ${record.statusCode} in ${responseTime}ms (${shortRequestId(record.requestId)})`;

  return reason ? `${summary} — ${compactMessage(reason)}` : summary;
}

export function createPinoHttpOptions(
  isDevelopment: boolean,
): Options<LoggableRequest, LoggableResponse> {
  return {
    genReqId: (req, res) => {
      const id = requestIdFromHeader(req) ?? randomUUID();
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
    customAttributeKeys: {
      err: 'error',
      reqId: 'requestId',
    },
    customLogLevel: (_req, res, error) => {
      if (res.statusCode >= 500 || error) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessObject: (req, res, value) =>
      withoutRequestId(createHttpLogRecord(req, res, responseTimeFrom(value))),
    customErrorObject: (req, res, error, value) =>
      withoutRequestId(
        createHttpLogRecord(req, res, responseTimeFrom(value), error),
      ),
    customSuccessMessage: (req, res, responseTime) =>
      createHttpLogMessage(req, res, responseTime),
    customErrorMessage: (req, res, error) =>
      createHttpLogMessage(req, res, Date.now() - res[startTime], error),
    quietReqLogger: true,
    quietResLogger: true,
    autoLogging: true,
    ...(isDevelopment && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
          translateTime: 'HH:MM:ss.l',
          ignore:
            'pid,hostname,requestId,method,path,statusCode,responseTime,userId',
          errorLikeObjectKeys: ['error'],
        },
      },
    }),
  };
}
