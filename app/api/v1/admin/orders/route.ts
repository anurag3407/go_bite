// app/api/v1/admin/orders/route.ts
// Campus order visibility for admins. The old AdminDashboard called GET
// /orders, which is customer-scoped — admins saw nothing. This is the
// campus-scoped read they actually need.

import { ok, withApi } from '@/lib/server/http';
import { requireActor, requireCampus } from '@/lib/server/rbac';
import { ApiError } from '@/lib/server/errors';
import { getStore } from '@/lib/server/store';
import { serializeOrdersForActor } from '@/lib/server/serializers';

export const dynamic = 'force-dynamic';

export const GET = withApi(async ({ req, requestId }) => {
  const actor = await requireActor(req);
  if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'CAMPUS_ADMIN' && actor.role !== 'QUERY_RESOLVER') {
    throw new ApiError('FORBIDDEN_TENANT');
  }
  const campusId = actor.role === 'SUPER_ADMIN' ? (req.nextUrl.searchParams.get('campusId') ?? requireCampus(actor)) : requireCampus(actor);
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 100) || 100, 200);

  const orders = await getStore().listOrdersByCampus(campusId, limit);
  return ok({ orders: serializeOrdersForActor(orders, actor) }, requestId);
});
