// app/api/v1/shop/orders/route.ts
// Merchant order queue. Scoped to the staff member's own shop via their actor
// `shopId` — a shop can never read another shop's orders.

import { ApiError } from '@/lib/server/errors';
import { ok, withApi } from '@/lib/server/http';
import { ACTIVE_STATUSES } from '@/lib/server/order-machine';
import { listOrdersForActor } from '@/lib/server/orders';
import { assertPermission, requireActor } from '@/lib/server/rbac';

export const dynamic = 'force-dynamic';

export const GET = withApi(async ({ req, requestId }) => {
  const actor = await requireActor(req);
  assertPermission(actor, 'orders:accept');

  if (!actor.shopId) {
    throw new ApiError('FORBIDDEN_TENANT', 'Your account is not linked to a merchant.');
  }

  const includeClosed = req.nextUrl.searchParams.get('includeClosed') === 'true';
  const orders = await listOrdersForActor(actor, includeClosed ? undefined : ACTIVE_STATUSES);

  return ok({ orders }, requestId);
});
