
/// app/api/v1/orders/[id]/actions/route.ts
// Customer-driven order actions. Cancellation is only legal inside the 120s
// window while PLACED, and disputes only from OUT_FOR_DELIVERY or within 6h of
// DELIVERED — both enforced by the state machine, not the client.

import { ok, readJson, withApi } from '@/lib/server/http';
import { cancelOrder, openDispute, rotateDeliveryPin } from '@/lib/server/orders';
import { requireActor } from '@/lib/server/rbac';
import { clientIp } from '@/lib/server/session';
import { orderActionSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const POST = withApi<{ id: string }>(async ({ req, params, requestId }) => {
  const actor = await requireActor(req);
  const body = await readJson(req, orderActionSchema);
  const ip = clientIp(req);

  if (body.action === 'cancel') {
    const order = await cancelOrder(actor, params.id, body.reason, ip);
    return ok({ order }, requestId);
  }

  if (body.action === 'rotate-pin') {
    const order = await rotateDeliveryPin(actor, params.id, ip);
    return ok({ order }, requestId);
  }

  const order = await openDispute(actor, params.id, body.note, ip);
  return ok({ order }, requestId);
});
