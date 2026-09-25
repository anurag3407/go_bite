// lib/api-client.ts
// Thin typed client for /api/v1. Unwraps the response envelope (plan.md §9.1)
// and turns failures into a typed error so UI code can react to the error code
// (e.g. show "shop closed" inline) instead of a generic message.

export interface ApiEnvelopeMeta {
  requestId: string;
  timestamp: string;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;
  readonly requestId?: string;

  constructor(
    code: string,
    message: string,
    status: number,
    details: Record<string, unknown> = {},
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Sent as Idempotency-Key for mutating endpoints that require it. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiClientError(
      'NETWORK_ERROR',
      'Could not reach Go-Bite. Check your connection and try again.',
      0,
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON response (proxy error page, etc.)
  }

  const envelope = payload as
    | { success: true; data: T; meta: ApiEnvelopeMeta }
    | {
        success: false;
        error: { code: string; message: string; details?: Record<string, unknown> };
        meta: ApiEnvelopeMeta;
      }
    | null;

  if (envelope && envelope.success === true) return envelope.data;

  if (envelope && envelope.success === false) {
    throw new ApiClientError(
      envelope.error.code,
      envelope.error.message,
      response.status,
      envelope.error.details ?? {},
      envelope.meta?.requestId,
    );
  }

  throw new ApiClientError(
    'INTERNAL',
    `Unexpected response from the server (${response.status}).`,
    response.status,
  );
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

/**
 * Generates an idempotency key for a one-shot user action. Reusing the same key
 * across retries of the same action is what makes duplicate orders impossible.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Human-readable message for any thrown value, for inline UI display. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
