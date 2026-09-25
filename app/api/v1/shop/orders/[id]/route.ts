// app/api/v1/shop/orders/[id]/route.ts
// Merchant order actions, dispatched by an explicit `action` field so the whole
// lifecycle lives behind one guarded, audited endpoint.
//
//   accept      → PLACED → ACCEPTED
//   reject      → PLACED/ACCEPTED → CANCELLED (with a reason shown to the student)
//   status      → merchant-driven progression (cooking, out for delivery)
//   verify-pin  → OUT_FOR_DELIVERY → DELIVERED, the only unlock for completion

import { ApiError } from '@/lib/server/errors';
import { ok, readJson, withApi } from '@/lib/server/http';
import { assertPermission, assertShopScope, requireActor } from '@/lib/server/rbac';
import { advanceOrder, cancelOrder, verifyDeliveryPin } from '@/lib/server/orders';
import { clientIp } from '@/lib/server/session';
import { getStore } from '@/lib/server/store';
import { shopOrderActionSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const POST = withApi<{ id: string }>(async ({ req, params, requestId }) => {
  const actor = await requireActor(req);
  assertPermission(actor, 'orders:accept');

  const store = getStore();
  const order = await store.getOrder(params.id);
  if (!order) throw new ApiError('NOT_FOUND');

  const shop = await store.getShop(order.shop_id);
  if (!shop) throw new ApiError('NOT_FOUND');
  assertShopScope(actor, shop);

  const body = await readJson(req, shopOrderActionSchema);
  const ip = clientIp(req);

  switch (body.action) {
    case 'accept':
      return ok({ order: await advanceOrder(actor, params.id, 'ACCEPTED', ip) }, requestId);

    case 'reject':
      // Shop-initiated cancellation; refunds automatically if already captured.
      return ok({ order: await cancelOrder(actor, params.id, body.reason, ip) }, requestId);

    case 'status':
      return ok({ order: await advanceOrder(actor, params.id, body.toStatus, ip) }, requestId);

    case 'verify-pin':
      return ok({ order: await verifyDeliveryPin(actor, params.id, body.pin, ip) }, requestId);
  }
});
