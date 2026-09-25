// app/api/v1/auth/otp/verify/route.ts
// Public endpoint: verifies the code, creates the account on first success, and
// issues a dual-transport session — httpOnly cookie for web, bearer token for
// native clients (plan.md §6.1).

import { ok, readJson, withApi } from '@/lib/server/http';
import { verifyOtp } from '@/lib/server/otp';
import { attachSessionCookie, clientIp, issueSession } from '@/lib/server/session';
import { otpVerifySchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const POST = withApi(async ({ req, requestId }) => {
  const body = await readJson(req, otpVerifySchema);
  const { user, isNewUser } = await verifyOtp(body.phone, body.otp, {
    campusId: body.campusId,
    name: body.name,
  });

  const session = await issueSession(user.id, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get('user-agent'),
    role: user.role,
  });

  const response = ok(
    {
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        phoneVerified: user.phone_verified,
        role: user.role,
        activeCampusId: user.active_campus_id ?? null,
        shopId: user.shop_id ?? null,
      },
      sessionToken: session.token,
      expiresAt: session.expiresAt,
      isNewUser,
    },
    requestId,
  );

  attachSessionCookie(response, session);
  return response;
});
