// app/api/v1/cart/route.ts
// Authenticated: reads the server-side cart re-priced against the live
// catalogue, or empties it.

import { clearCart, hydrateCart, toClientCart } from '@/lib/server/cart';
import { ok, withApi } from '@/lib/server/http';
import { requireActor } from '@/lib/server/rbac';

export const dynamic = 'force-dynamic';

export const GET = withApi(async ({ req, requestId }) => {
  const actor = await requireActor(req);

  if (!actor.campusId) {
    // Not an error: the client shows the campus picker before ordering.
    return ok({ cart: null, campusRequired: true }, requestId);
  }

  const hydrated = await hydrateCart(actor.userId, actor.campusId);
  return ok({ cart: hydrated ? toClientCart(hydrated) : null, campusRequired: false }, requestId);
});

export const DELETE = withApi(async ({ req, requestId }) => {
  const actor = await requireActor(req);
  await clearCart(actor.userId);
  return ok({ cart: null }, requestId);
});
