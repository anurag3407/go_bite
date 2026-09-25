// app/api/v1/users/me/campus/route.ts
// Persists the user's active campus (plan.md §5.2). The authoritative value is
// the users row; the KV copy is the hot read, and the client mirrors it.

import { ApiError } from '@/lib/server/errors';
import { ok, readJson, withApi } from '@/lib/server/http';
import { keys, kv } from '@/lib/server/kv';
import { requireActor } from '@/lib/server/rbac';
import { getStore } from '@/lib/server/store';
import { selectCampusSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const POST = withApi(async ({ req, requestId }) => {
  const actor = await requireActor(req);
  const body = await readJson(req, selectCampusSchema);

  const store = getStore();
  const campus = await store.getCampus(body.campusId);
  if (!campus || !campus.is_active) {
    throw new ApiError('NOT_FOUND', 'That campus is not available.');
  }

  const user = await store.updateUser(actor.userId, { active_campus_id: campus.id });
  await kv.set(keys.userCampus(actor.userId), campus.id, 24 * 60 * 60);

  return ok(
    {
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        activeCampusId: user.active_campus_id ?? null,
        shopId: user.shop_id ?? null,
      },
    },
    requestId,
  );
});
