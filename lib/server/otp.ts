// lib/server/otp.ts
// Phone-first authentication (plan.md §6.1, §12).
//
// Defences layered here:
//   1. per-phone 60s request cooldown
//   2. hourly request/verify rate ceilings
//   3. short lockout after repeated bad codes
//   4. HMAC-hashed codes at rest with a 5-minute expiry
//   5. constant-time comparison and a hard attempt cap per code
//
// OTPs are never logged in production. In demo mode (no SMS provider, non-prod)
// the code is returned to the caller so the app remains usable.

import type { User } from '@/lib/types';
import { appEnv, otpDevMode, smsEnabled } from './env';
import { ApiError } from './errors';
import { assertDailySmsLimit, assertRateLimit, keys, kv } from './kv';
import { generateOtp, hashOtp, normalizePhone, timingSafeEqualStr } from './security';
import { dispatchOtpSms, maskPhone } from './sms';
import { getStore } from './store';

const OTP_TTL_SECONDS = 5 * 60;
const OTP_COOLDOWN_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60 * 60;

export interface OtpRequestResult {
  cooldownSec: number;
  /** Present only in demo mode, so the app is testable without an SMS provider. */
  devOtp?: string;
}

async function assertNotLocked(phone: string): Promise<void> {
  const locked = await kv.get(keys.otpLockout(phone));
  if (locked) {
    const ttl = await kv.ttl(keys.otpLockout(phone));
    throw new ApiError('AUTH_OTP_LOCKED', undefined, { retryAfterSec: Math.max(ttl, 0) });
  }
}

async function lockPhone(phone: string): Promise<void> {
  await kv.set(keys.otpLockout(phone), '1', LOCKOUT_SECONDS);
}

/**
 * Issues a fresh OTP. Returns the cooldown the client should honour; the code
 * itself only leaves the server over SMS (or in demo mode, in the response).
 */
export async function requestOtp(phoneInput: string): Promise<OtpRequestResult> {
  const phone = normalizePhone(phoneInput);
  if (!phone) throw new ApiError('VALIDATION_ERROR', 'Enter a valid 10-digit Indian mobile number.', { field: 'phone' });

  await assertNotLocked(phone);
  await assertRateLimit('otpRequest', phone);
  if (smsEnabled) {
    await assertDailySmsLimit(appEnv.maxDailySms);
  }

  // Cooldown is enforced atomically with SET NX so parallel taps cannot both win.
  const acquired = await kv.setNX(keys.otpCooldown(phone), '1', OTP_COOLDOWN_SECONDS);
  if (!acquired) {
    const ttl = await kv.ttl(keys.otpCooldown(phone));
    throw new ApiError('AUTH_OTP_COOLDOWN', undefined, { retryAfterSec: Math.max(ttl, 1) });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();

  await getStore().saveOtp({
    phone,
    otp_hash: hashOtp(phone, otp),
    expires_at: expiresAt,
    attempts: 0,
    is_used: false,
  });

  const result = await dispatchOtpSms(phone, otp);
  if (!result.sent) {
    console.warn('[otp] dispatch failed or unconfigured', {
      phone: maskPhone(phone),
      error: result.error,
    });
    // Silent SMS = stranded user. In prod (real SMS expected) fail loudly so
    // the client shows "couldn't send" instead of a fake "code sent" state.
    // In demo mode the OTP is returned in-band, so the pilot stays usable.
    if (!otpDevMode) {
      await getStore().invalidateOtps(phone);
      await kv.del(keys.otpCooldown(phone));
      throw new ApiError('DEPENDENCY_DOWN', 'Could not send the verification SMS. Try again in a minute.', {
        providerError: result.error ?? 'unknown',
      });
    }
  }

  return {
    cooldownSec: OTP_COOLDOWN_SECONDS,
    ...(otpDevMode ? { devOtp: otp } : {}),
  };
}

export interface OtpVerifyResult {
  user: User;
  isNewUser: boolean;
}

/**
 * Verifies a submitted code and returns the authenticated user, creating the
 * account on first successful verification.
 */
export async function verifyOtp(
  phoneInput: string,
  otp: string,
  options: { campusId?: string; name?: string } = {},
): Promise<OtpVerifyResult> {
  const phone = normalizePhone(phoneInput);
  if (!phone) throw new ApiError('VALIDATION_ERROR', 'Enter a valid 10-digit Indian mobile number.', { field: 'phone' });

  await assertNotLocked(phone);
  await assertRateLimit('otpVerify', phone);

  const store = getStore();
  const record = await store.getOtp(phone);

  if (!record) {
    throw new ApiError('AUTH_OTP_EXPIRED', 'No active code for this number. Request a new one.');
  }

  if (new Date(record.expires_at).getTime() <= Date.now()) {
    await store.invalidateOtps(phone);
    throw new ApiError('AUTH_OTP_EXPIRED');
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    await store.invalidateOtps(phone);
    await lockPhone(phone);
    throw new ApiError('AUTH_OTP_LOCKED');
  }

  const matches = timingSafeEqualStr(record.otp_hash, hashOtp(phone, otp));
  if (!matches) {
    const attempts = await store.incrementOtpAttempts(phone);
    if (attempts >= MAX_OTP_ATTEMPTS) {
      await store.invalidateOtps(phone);
      await lockPhone(phone);
      throw new ApiError('AUTH_OTP_LOCKED');
    }
    throw new ApiError('AUTH_OTP_INVALID', undefined, {
      attemptsRemaining: Math.max(MAX_OTP_ATTEMPTS - attempts, 0),
    });
  }

  // Success: burn the code and clear the cooldown so a re-login is not blocked.
  await store.invalidateOtps(phone);
  await kv.del(keys.otpCooldown(phone));

  const existing = await store.getUserByPhone(phone);
  if (existing) {
    if (!existing.is_active) {
      throw new ApiError('FORBIDDEN_TENANT', 'This account has been deactivated.');
    }
    return { user: existing, isNewUser: false };
  }

  const created = await store.createUser({
    name: options.name?.trim() || `Student ${phone.slice(-4)}`,
    phone,
    role: 'CUSTOMER',
    active_campus_id: options.campusId ?? null,
  });
  return { user: created, isNewUser: true };
}
