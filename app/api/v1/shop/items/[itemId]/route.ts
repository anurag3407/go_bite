// app/api/v1/shop/items/[itemId]/route.ts
// Merchant stock toggle. Availability changes here are immediately visible to
// customers, because the catalogue is read from the same store the checkout
// re-prices against — no separate inventory truth to drift out of sync.

import { ApiError } from '@/lib/server/errors';
import { ok, readJson, withApi } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { assertPermission, requireActor } from '@/lib/server/rbac';
import { clientIp } from '@/lib/server/session';
import { getStore } from '@/lib/server/store';
import { setItemAvailabilitySchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const PATCH = withApi<{ itemId: string }>(async ({ req, params, requestId }) => {
  const actor = await requireActor(req);
  assertPermission(actor, 'menu:manage');
  if (!actor.shopId) throw new ApiError('FORBIDDEN_TENANT', 'Your account is not linked to a merchant.');

  const body = await readJson(req, setItemAvailabilitySchema);

  // The store enforces the tenant scope: an item from another shop updates 0 rows.
  const item = await getStore().setItemAvailability(actor.shopId, params.itemId, body.isAvailable);
  if (!item) throw new ApiError('NOT_FOUND');

  await audit({
    actor,
    action: 'ITEM_AVAILABILITY_CHANGED',
    entity: 'catalog_item',
    entityId: item.id,
    metadata: { isAvailable: body.isAvailable },
    ipAddress: clientIp(req),
  });

  return ok({ item }, requestId);
});
