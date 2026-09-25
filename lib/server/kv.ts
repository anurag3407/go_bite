// lib/server/kv.ts
// Key-value primitives plus the derived policies the platform needs:
// OTP cooldown, hourly ceilings, lockouts, sliding-ish rate limits, distributed
// locks and idempotency keys.
//
// plan.md §7 specifies Redis for these concerns. This deployment target has no
// Redis, so the same key namespace (`gb:*`) is served by an in-process store.
// `KVDriver` is the seam a Redis driver plugs into without touching callers.

import { ApiError } from './errors';

export interface KVDriver {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Sets only if absent. Returns true when the key was written. */
  setNX(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
  /** Atomic increment; returns the new value. */
  incr(key: string, ttlSeconds?: number): Promise<number>;
  /** Remaining lifetime in seconds, or -1 when no TTL / missing. */
  ttl(key: string): Promise<number>;
}

type Entry = { value: string; expiresAt: number | null };

class MemoryKVDriver implements KVDriver {
  private store = new Map<string, Entry>();

  private read(key: string): Entry | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    return this.read(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async setNX(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (this.read(key) !== null) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const current = this.read(key);
    const next = (current ? Number(current.value) : 0) + 1;
    const expiresAt =
      current?.expiresAt ?? (ttlSeconds ? Date.now() + ttlSeconds * 1000 : null);
    this.store.set(key, { value: String(next), expiresAt });
    return next;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.read(key);
    if (!entry || entry.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  /** Test helper: wipes all keys. */
  async flush(): Promise<void> {
    this.store.clear();
  }
}

// Survive Next.js dev hot-reloads without losing rate-limit state.
const globalForKv = globalThis as unknown as { __gobiteKv?: MemoryKVDriver };
export const kv: MemoryKVDriver = globalForKv.__gobiteKv ?? new MemoryKVDriver();
if (!globalForKv.__gobiteKv) globalForKv.__gobiteKv = kv;

export const keys = {
  otpCooldown: (phone: string) => `gb:otp:cooldown:${phone}`,
  otpAttempts: (phone: string) => `gb:otp:attempts:${phone}`,
  otpLockout: (phone: string) => `gb:otp:lockout:${phone}`,
  otpRecord: (phone: string) => `gb:otp:record:${phone}`,
  session: (tokenHash: string) => `gb:session:${tokenHash}`,
  userCampus: (userId: string) => `gb:user:${userId}:campus`,
  cart: (userId: string) => `gb:cart:${userId}`,
  rateLimit: (bucket: string, identifier: string) => `gb:rl:${bucket}:${identifier}`,
  pinAttempts: (orderId: string) => `gb:rl:pin:${orderId}`,
  dailySms: (dateStr: string) => `gb:quota:sms:${dateStr}`,
  idempotency: (userId: string, key: string) => `gb:idem:${userId}:${key}`,
  lock: (resource: string) => `gb:lock:${resource}`,
} as const;

/** Declared rate-limit buckets (plan.md §15.2). */
export const RATE_LIMITS = {
  otpRequest: { limit: 5, windowSeconds: 60 * 60 },
  otpRequestIp: { limit: 12, windowSeconds: 60 * 60 },
  otpVerify: { limit: 10, windowSeconds: 60 * 60 },
  orderCreate: { limit: 20, windowSeconds: 60 * 60 },
  cartWrite: { limit: 120, windowSeconds: 60 },
  pinVerify: { limit: 5, windowSeconds: 15 * 60 },
  support: { limit: 10, windowSeconds: 60 * 60 },
  general: { limit: 300, windowSeconds: 60 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

/**
 * Fixed-window limiter. Throws RATE_LIMITED carrying retryAfterSec.
 * A Redis driver would swap this for the sliding-window Lua script in plan.md §7.5.
 */
export async function assertRateLimit(
  bucket: RateLimitBucket,
  identifier: string,
): Promise<void> {
  const { limit, windowSeconds } = RATE_LIMITS[bucket];
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `${keys.rateLimit(bucket, identifier)}:${windowStart}`;

  const count = await kv.incr(key, windowSeconds);
  if (count > limit) {
    const elapsed = Math.floor(Date.now() / 1000) % windowSeconds;
    throw new ApiError('RATE_LIMITED', undefined, {
      retryAfterSec: windowSeconds - elapsed,
      bucket,
    });
  }
}

/**
 * Daily platform-wide SMS quota circuit breaker.
 * Protects SMS provider balance against distributed pump/drain attacks.
 */
export async function assertDailySmsLimit(maxDaily: number): Promise<{ count: number; remaining: number }> {
  const now = new Date();
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffsetMs).toISOString().slice(0, 10);
  const key = keys.dailySms(istDate);

  const count = await kv.incr(key, 48 * 3600);
  if (count > maxDaily) {
    throw new ApiError(
      'RATE_LIMITED',
      'Daily campus SMS notification quota has been reached. Please contact campus administration.',
      {
        bucket: 'dailySms',
        limit: maxDaily,
        count,
      },
    );
  }
  return { count, remaining: Math.max(0, maxDaily - count) };
}

/**
 * Runs the body as idempotent work guarded by (userId, key, fingerprint).
 * Same key + same fingerprint → replay. Same key + different fingerprint →
 * 409 VALIDATION_ERROR (IDEMPOTENCY_KEY_REUSE) instead of silently returning
 * someone else's order.
 */
export async function runIdempotent<T>(
  userId: string,
  idempotencyKey: string,
  fn: () => Promise<T>,
  ttlSeconds = 24 * 60 * 60,
  fingerprint?: string,
): Promise<{ replayed: boolean; value: T }> {
  const key = keys.idempotency(userId, idempotencyKey);
  const existing = await kv.get(key);
  if (existing) {
    const parsed = JSON.parse(existing) as { fingerprint?: string; value: T };
    // Pre-fingerprint records replay as before; new records enforce the match.
    if (!fingerprint || !parsed.fingerprint || parsed.fingerprint === fingerprint) {
      return { replayed: true, value: parsed.value };
    }
    throw new ApiError('VALIDATION_ERROR', 'This Idempotency-Key was already used for a different request.', {
      code: 'IDEMPOTENCY_KEY_REUSE',
    });
  }

  // Short lock so two concurrent requests with the same key serialise.
  // Token is CSPRNG, not Math.random — two racers must not share a token.
  const lockToken = `${Date.now()}-${crypto.randomUUID()}`;
  const acquired = await kv.setNX(keys.lock(`idem:${userId}:${idempotencyKey}`), lockToken, 15);
  if (!acquired) {
    throw new ApiError('RATE_LIMITED', 'This request is already being processed.', {
      retryAfterSec: 2,
    });
  }

  try {
    const doubleCheck = await kv.get(key);
    if (doubleCheck) {
      const parsed = JSON.parse(doubleCheck) as { fingerprint?: string; value: T };
      if (!fingerprint || !parsed.fingerprint || parsed.fingerprint === fingerprint) {
        return { replayed: true, value: parsed.value };
      }
      throw new ApiError('VALIDATION_ERROR', 'This Idempotency-Key was already used for a different request.', {
        code: 'IDEMPOTENCY_KEY_REUSE',
      });
    }

    const value = await fn();
    await kv.set(key, JSON.stringify({ fingerprint: fingerprint ?? null, value }), ttlSeconds);
    return { replayed: false, value };
  } finally {
    await kv.del(keys.lock(`idem:${userId}:${idempotencyKey}`));
  }
}
