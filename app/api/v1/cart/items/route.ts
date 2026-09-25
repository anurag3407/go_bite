// app/api/v1/cart/items/route.ts
// Authenticated: adds or updates a cart line. Rejects closed merchants and
// out-of-stock items, and returns CART_CONFLICT_SINGLE_SHOP (with the current
// cart) when the item belongs to a different merchant than the cart does.

import { addCartItem, hydrateCart, toClientCart } from '@/lib/server/cart';
import { ApiError } from '@/lib/server/errors';
import { ok, readJson, withApi } from '@/lib/server/http';
import { assertRateLimit } from '@/lib/server/kv';
import { requireActor, requireCampus } from '@/lib/server/rbac';
import { getStore } from '@/lib/server/store';
import { cartUpsertSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const PUT = withApi(async ({ req, requestId }) => {
  const actor = await requireActor(req);
  const campusId = requireCampus(actor);
  const body = await readJson(req, cartUpsertSchema);

  await assertRateLimit('cartWrite', actor.userId);

  const store = getStore();
  const shop = await store.getShop(body.shopId);
  if (!shop) throw new ApiError('NOT_FOUND', 'Merchant not found.');

  const items = await store.getItemsByIds([body.itemId]);
  const item = items.find((entry) => entry.id === body.itemId);
  // An item that exists but belongs to another shop is reported as not found:
  // never confirm the existence of another tenant's catalogue entry.
  if (!item || item.shop_id !== shop.id) {
    throw new ApiError('NOT_FOUND', 'Item not found for this merchant.');
  }

  await addCartItem(actor.userId, campusId, shop, item, body.quantity);

  const hydrated = await hydrateCart(actor.userId, campusId);
  return ok({ cart: hydrated ? toClientCart(hydrated) : null }, requestId);
});
