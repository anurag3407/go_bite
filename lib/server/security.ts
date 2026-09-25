// lib/server/security.ts
// Cryptographic helpers for auth, OTP and delivery-PIN verification.
// Everything here uses node:crypto — never Math.random for security values.

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { sessionSecret } from './env';

/** Stable fingerprint of the order payload — binds an Idempotency-Key to one cart. */
export function idempotencyFingerprint(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

/** Normalises an Indian mobile number to bare 10 digits. Returns null if invalid. */
export function normalizePhone(input: string): string | null {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/\D/g, '');
  const last10 = digits.length > 10 ? digits.slice(-10) : digits;
  // Indian mobiles start with 6-9.
  return /^[6-9]\d{9}$/.test(last10) ? last10 : null;
}

/** Formats a normalised 10-digit number for display/SMS dispatch. */
export function toE164India(phone10: string): string {
  return `+91${phone10}`;
}

/**
 * Constant-time string comparison. Guards PIN and OTP comparison against
 * timing side-channels (plan.md §10.3).
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Compare fixed-length HMAC digests rather than raw values so differing
  // lengths cannot leak information via early return.
  const ha = createHmac('sha256', sessionSecret).update(a).digest();
  const hb = createHmac('sha256', sessionSecret).update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** 6-digit numeric OTP, cryptographically random. */
export function generateOtp(): string {
  return String(randomInt(100_000, 1_000_000));
}

/**
 * 4-digit delivery PIN, cryptographically random, zero-padded.
 * Covers the full 0000-9999 space (plan.md §10.3).
 */
export function generateDeliveryPin(): string {
  return String(randomInt(0, 10_000)).padStart(4, '0');
}

/** Opaque session token (URL-safe, 256 bits of entropy). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Peppered HMAC digest. Used so a leaked database dump does not expose usable
 * OTPs or session tokens (plan.md §8 stores `otp_hash`, not raw codes).
 */
export function hashSecret(value: string): string {
  return createHmac('sha256', sessionSecret).update(value).digest('hex');
}

/** Hashes an OTP bound to its phone number, preventing cross-number replay. */
export function hashOtp(phone10: string, otp: string): string {
  return hashSecret(`${phone10}:${otp}`);
}

/** Short opaque identifier prefix, for logs and order numbers. */
export function shortId(bytes = 4): string {
  return randomBytes(bytes).toString('hex');
}

/** Human-readable order number, e.g. GB-BIH-7F3K2A. */
export function generateOrderNumber(campusCode: string): string {
  const campusTag = campusCode.replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase() || 'GEN';
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  return `GB-${campusTag}-${suffix}`;
}
