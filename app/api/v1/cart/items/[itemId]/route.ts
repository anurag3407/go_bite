// app/api/v1/cart/items/[itemId]/route.ts
// Authenticated: removes a single cart line.

import { hydrateCart, removeCartItem, toClientCart } from '@/lib/server/cart';
import { ok, withApi } from '@/lib/server/http';
import { requireActor, requireCampus } from '@/lib/server/rbac';

export const dynamic = 'force-dynamic';

export const DELETE = withApi<{ itemId: string }>(async ({ req, params, requestId }) => {
  const actor = await requireActor(req);
  const campusId = requireCampus(actor);

  await removeCartItem(actor.userId, params.itemId);

  const hydrated = await hydrateCart(actor.userId, campusId);
  return ok({ cart: hydrated ? toClientCart(hydrated) : null }, requestId);
});
