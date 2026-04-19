import axios, { AxiosError } from 'axios';

/**
 * Typed error the whole app throws/catches. Every API failure is mapped into
 * one of these — UI code never sees raw Axios errors.
 */
export type ApiErrorKind =
  | 'network'        // no response (DNS, offline, timeout)
  | 'unauthorized'   // 401 after refresh attempt
  | 'forbidden'      // 403
  | 'not-found'      // 404
  | 'conflict'       // 409
  | 'validation'     // 400 / 422
  | 'rate-limited'   // 429
  | 'server'         // 5xx
  | 'unknown';

export class ApiError extends Error {
  readonly kind:        ApiErrorKind;
  readonly status?:     number;
  readonly fieldErrors?: Record<string, string>;

  constructor(params: {
    kind:         ApiErrorKind;
    message:      string;
    status?:      number;
    fieldErrors?: Record<string, string>;
    cause?:       unknown;
  }) {
    super(params.message);
    this.name        = 'ApiError';
    this.kind        = params.kind;
    this.status      = params.status;
    this.fieldErrors = params.fieldErrors;
    if (params.cause !== undefined) {
      (this as { cause?: unknown }).cause = params.cause;
    }
  }
}

type ErrorBody = {
  message?: string | string[];
  error?:   string;
  errors?:  Record<string, string> | { property: string; message: string }[];
};

/**
 * Converts an Axios error (or anything thrown from a request) into an ApiError.
 * Always returns an ApiError — never re-throws the original.
 */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (!axios.isAxiosError(err)) {
    return new ApiError({
      kind:    'unknown',
      message: err instanceof Error ? err.message : 'Something went wrong.',
      cause:   err,
    });
  }

  const axErr = err as AxiosError<ErrorBody>;

  if (!axErr.response) {
    return new ApiError({
      kind:    'network',
      message: 'Can’t reach the server. Check your connection and try again.',
      cause:   axErr,
    });
  }

  const status = axErr.response.status;
  const body   = axErr.response.data;

  const kind: ApiErrorKind =
    status === 401                  ? 'unauthorized'
    : status === 403                ? 'forbidden'
    : status === 404                ? 'not-found'
    : status === 409                ? 'conflict'
    : status === 400 || status === 422 ? 'validation'
    : status === 429                ? 'rate-limited'
    : status >= 500                 ? 'server'
    : 'unknown';

  const messageRaw = body?.message;
  const message    =
    Array.isArray(messageRaw) ? messageRaw[0] ?? 'Request failed.'
    : typeof messageRaw === 'string' ? messageRaw
    : body?.error ?? fallbackMessageFor(kind);

  const fieldErrors = extractFieldErrors(body);

  return new ApiError({ kind, status, message, fieldErrors, cause: axErr });
}

function fallbackMessageFor(kind: ApiErrorKind): string {
  switch (kind) {
    case 'unauthorized': return 'Please sign in again.';
    case 'forbidden':    return 'You don’t have permission to do that.';
    case 'not-found':    return 'We couldn’t find that.';
    case 'conflict':     return 'That conflicts with something that already exists.';
    case 'validation':   return 'Please check the details and try again.';
    case 'rate-limited': return 'Too many attempts. Please wait a moment.';
    case 'server':       return 'Server error. Please try again.';
    default:             return 'Something went wrong.';
  }
}

function extractFieldErrors(body: ErrorBody | undefined): Record<string, string> | undefined {
  if (!body?.errors) return undefined;
  if (Array.isArray(body.errors)) {
    const out: Record<string, string> = {};
    for (const { property, message } of body.errors) out[property] = message;
    return out;
  }
  return body.errors;
}
