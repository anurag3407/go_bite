// app/api/v1/auth/session/route.ts
// Returns the authenticated user plus the exact permissions their role grants,
// so the client can gate UI without hard-coding role names.

import { ROLE_PERMISSIONS } from '@/lib/auth';
import { otpDevMode } from '@/lib/server/env';
import { ok, withApi } from '@/lib/server/http';
import { resolveActor } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export const GET = withApi(async ({ req, requestId }) => {
  const actor = await resolveActor(req);
  if (!actor) {
    // Not an error condition — the client uses this to decide signed-out vs in.
    return ok({ user: null, permissions: [] as string[], demoMode: otpDevMode }, requestId);
  }

  return ok(
    {
      user: {
        id: actor.userId,
        name: actor.name,
        phone: actor.phone,
        role: actor.role,
        activeCampusId: actor.campusId,
        shopId: actor.shopId,
      },
      permissions: ROLE_PERMISSIONS[actor.role],
      demoMode: otpDevMode,
    },
    requestId,
  );
});
