// app/api/v1/auth/otp/request/route.ts
// Public endpoint: issues an OTP for a phone number. Enforces a 60s cooldown and
// hourly ceilings; the HTTP path stays fast and does not leak whether the number
// is already registered (account enumeration defence).

import { ok, readJson, withApi } from '@/lib/server/http';
import { clientIp } from '@/lib/server/session';
import { requestOtp } from '@/lib/server/otp';
import { otpRequestSchema } from '@/lib/server/validation';
import { assertRateLimit } from '@/lib/server/kv';

export const dynamic = 'force-dynamic';

export const POST = withApi(async ({ req, requestId }) => {
  const body = await readJson(req, otpRequestSchema);

  // Dedicated per-IP ceiling on top of the per-phone controls, so a single host
  // cannot enumerate numbers or burn SMS credit.
  const ip = clientIp(req);
  if (ip) await assertRateLimit('otpRequestIp', `otp-ip:${ip}`);

  const result = await requestOtp(body.phone);
  return ok(result, requestId);
});
