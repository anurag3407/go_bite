// lib/server/http.ts
// Response envelope, request ids, origin checking and the route wrapper.
// Every /api/v1 response uses the envelope in plan.md §9.1.

import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, isApiError, type ErrorCode } from './errors';
import { appEnv } from './env';

export type ApiMeta = { requestId: string; timestamp: string };

export type ApiSuccess<T> = {
  success: true;
  data: T;
  error: null;
  meta: ApiMeta;
};

export type ApiFailure = {
  success: false;
  data: null;
  error: { code: ErrorCode; message: string; details: Record<string, unknown> };
  meta: ApiMeta;
};

export function newRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

function meta(requestId: string): ApiMeta {
  return { requestId, timestamp: new Date().toISOString() };
}

/** Success envelope. */
export function ok<T>(data: T, requestId: string, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true, data, error: null, meta: meta(requestId) }, init);
}

/** Failure envelope built from an ApiError. */
export function fail(error: ApiError, requestId: string): NextResponse<ApiFailure> {
  return NextResponse.json(
    {
      success: false,
      data: null,
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? {},
      },
      meta: meta(requestId),
    },
    { status: error.httpStatus },
  );
}

/**
 * Rejects cross-site state-changing requests. Session cookies are SameSite=Lax,
 * and this origin check closes the gap for browsers that still send them.
 */
function assertSameOrigin(req: NextRequest): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;

  const origin = req.headers.get('origin');
  if (!origin) return; // Non-browser client (curl, native app with bearer token).

  const host = req.headers.get('host');
  const allowed = new Set<string>();
  if (host) allowed.add(host);
  try {
    allowed.add(new URL(appEnv.appUrl).host);
  } catch {
    /* appUrl is validated at load; ignore */
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError('FORBIDDEN_TENANT', 'Invalid request origin.');
  }

  if (!allowed.has(originHost)) {
    throw new ApiError('FORBIDDEN_TENANT', 'Cross-origin requests are not allowed.');
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * Public, non-personalised reads (campus list, shop list, menu). These are the
 * hot path at lunch rush: without a shared cache every student load hits the
 * database, and the old N+1 menu fetch made it worse. Short s-maxage + SWR is
 * what lets a CDN/Nginx absorb the burst.
 */
export function okPublic<T>(
  data: T,
  requestId: string,
  init?: { sMaxAge?: number; staleWhileRevalidate?: number },
): NextResponse<ApiSuccess<T>> {
  const sMaxAge = init?.sMaxAge ?? 30;
  const swr = init?.staleWhileRevalidate ?? 120;
  return NextResponse.json(
    { success: true, data, error: null, meta: meta(requestId) },
    {
      headers: {
        'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
      },
    },
  );
}

export type RouteArgs<P> = {
  req: NextRequest;
  params: P;
  requestId: string;
};

type RouteHandler<P> = (args: RouteArgs<P>) => Promise<Response> | Response;

/**
 * Wraps a route handler with request-id generation, origin checking, error
 * mapping and no-store caching. Route handlers stay thin: authenticate →
 * validate → call domain logic → return the envelope.
 */
export function withApi<P extends Record<string, string | string[]> = Record<string, never>>(
  handler: RouteHandler<P>,
) {
  return async function route(
    req: NextRequest,
    ctx?: { params?: Promise<P> },
  ): Promise<Response> {
    const requestId = newRequestId();
    try {
      assertSameOrigin(req);
      const params = (ctx?.params ? await ctx.params : ({} as P)) as P;
      const response = await handler({ req, params, requestId });
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        // A route that deliberately opted into shared caching (okPublic) keeps
        // its own Cache-Control; everything else is no-store by default.
        if (name === 'Cache-Control' && response.headers.get('Cache-Control')?.includes('s-maxage')) {
          continue;
        }
        response.headers.set(name, value);
      }
      return response;
    } catch (error) {
      if (isApiError(error)) return fail(error, requestId);

      // Unexpected failures are logged with the request id that we also return,
      // so a user-reported error can be traced to a log line.
      console.error('[api] unhandled error', { requestId, error });
      const internal = new ApiError('INTERNAL', undefined, { requestId });
      return fail(internal, requestId);
    }
  };
}

/** Parses and validates a JSON body, mapping Zod failures to VALIDATION_ERROR. */
export async function readJson<T>(
  req: NextRequest,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } },
): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Request body must be valid JSON.');
  }

  const result = schema.safeParse(body);
  if (!result.success || result.data === undefined) {
    const details =
      result.error && typeof result.error === 'object' && 'flatten' in result.error
        ? (result.error as { flatten: () => unknown }).flatten()
        : {};
    throw new ApiError('VALIDATION_ERROR', undefined, details as Record<string, unknown>);
  }
  return result.data;
}

/** Reads a required Idempotency-Key header (UUID-ish) for ⚠ endpoints. */
export function readIdempotencyKey(req: NextRequest): string {
  const key = req.headers.get('idempotency-key');
  if (!key || key.length < 8 || key.length > 100) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'A valid Idempotency-Key header (8-100 characters) is required for this request.',
      { header: 'Idempotency-Key' },
    );
  }
  return key;
}
