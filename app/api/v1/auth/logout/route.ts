// app/api/v1/auth/logout/route.ts
// Revokes the server-side session record, so a lost phone can be signed out
// instantly and globally (plan.md §6.1). Safe to call without a session.
// ?all=true revokes every session for the user (lost/stolen device).

import { ok, withApi } from '@/lib/server/http';
import { requireActor } from '@/lib/server/rbac';
import {
  clearSessionCookie,
  readSessionToken,
  revokeAllSessions,
  revokeSession,
} from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export const POST = withApi(async ({ req, requestId }) => {
  const token = readSessionToken(req);
  const revokedAll = req.nextUrl.searchParams.get('all') === 'true';

  if (revokedAll) {
    const actor = await requireActor(req);
    await revokeAllSessions(actor.userId);
  } else if (token) {
    await revokeSession(token);
  }

  const response = ok({ ok: true, revokedAll }, requestId);
  clearSessionCookie(response);
  return response;
});
