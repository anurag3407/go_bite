// lib/server/sms.ts
// Fast2SMS transports (plan.md §12).
//   - dispatchOtpSms: DLT OTP route (existing behaviour, unchanged).
//   - dispatchOrderSms: operational order updates (q route). Both are awaited
//     with a hard timeout; failures are returned, never thrown. Callers decide
//     whether failure is fatal (OTP request: yes in prod) or best-effort
//     (order updates: never fatal — see notifications.ts).

import { appEnv, smsEnabled } from './env';
import { toE164India } from './security';

const FAST2SMS_ENDPOINT = 'https://www.fast2sms.com/dev/bulkV2';
const DISPATCH_TIMEOUT_MS = 5000;

export interface SmsResult {
  sent: boolean;
  providerRef?: string;
  error?: string;
}

export async function dispatchOtpSms(phone10: string, otp: string): Promise<SmsResult> {
  if (!smsEnabled || !appEnv.fast2smsApiKey) {
    return { sent: false, error: 'SMS provider not configured' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);

  try {
    const response = await fetch(FAST2SMS_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: appEnv.fast2smsApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route: 'otp',
        variables_values: otp,
        numbers: phone10,
        ...(appEnv.fast2smsSenderId ? { sender_id: appEnv.fast2smsSenderId } : {}),
        ...(appEnv.fast2smsOtpTemplateId ? { template_id: appEnv.fast2smsOtpTemplateId } : {}),
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    const payload = (await response.json().catch(() => null)) as
      | { return?: boolean; request_id?: string; message?: string[] }
      | null;

    if (!response.ok || payload?.return === false) {
      return {
        sent: false,
        error: payload?.message?.join(', ') ?? `Fast2SMS responded ${response.status}`,
      };
    }

    return { sent: true, providerRef: payload?.request_id };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'SMS dispatch failed' };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Operational order SMS (new orders, accept/out-for-delivery/cancel).
 * Uses the `q` route with the DLT-approved sender id; never throws.
 */
export async function dispatchOrderSms(phone10: string, message: string): Promise<SmsResult> {
  if (!smsEnabled || !appEnv.fast2smsApiKey) {
    return { sent: false, error: 'SMS provider not configured' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);

  try {
    const response = await fetch(FAST2SMS_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: appEnv.fast2smsApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route: 'q',
        ...(appEnv.fast2smsSenderId ? { sender_id: appEnv.fast2smsSenderId } : {}),
        message,
        numbers: phone10,
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    const payload = (await response.json().catch(() => null)) as
      | { return?: boolean; request_id?: string; message?: string[] }
      | null;

    if (!response.ok || payload?.return === false) {
      return {
        sent: false,
        error: payload?.message?.join(', ') ?? `Fast2SMS responded ${response.status}`,
      };
    }

    return { sent: true, providerRef: payload?.request_id };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'SMS dispatch failed' };
  } finally {
    clearTimeout(timeout);
  }
}

/** Redacted form for logs — never log a full phone number. */
export function maskPhone(phone10: string): string {
  return `${toE164India(phone10).slice(0, 6)}****${phone10.slice(-2)}`;
}
