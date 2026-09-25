// app/api/v1/cart/validate/route.ts
// Authenticated: the checkout precondition (plan.md §7.4). Re-prices every line
// against the live catalogue and reports every reason the order could not be
// placed, so the UI can explain the problem instead of failing at placement.

import { hydrateCart, toClientCart } from '@/lib/server/cart';
import { ok, withApi } from '@/lib/server/http';
import { requireActor, requireCampus } from '@/lib/server/rbac';
import type { CartIssue } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const POST = withApi(async ({ req, requestId }) => {
  const actor = await requireActor(req);
  const campusId = requireCampus(actor);

  const hydrated = await hydrateCart(actor.userId, campusId);

  if (!hydrated) {
    const issues: CartIssue[] = [{ code: 'CART_EMPTY', message: 'Your cart is empty.' }];
    return ok({ cart: null, pricing: null, issues, orderable: false }, requestId);
  }

  const issues: CartIssue[] = [];

  if (!hydrated.shop.is_open || hydrated.shop.is_snoozed) {
    issues.push({
      code: 'SHOP_CLOSED',
      message: `${hydrated.shop.name} is not accepting orders right now.`,
    });
  }

  if (hydrated.unavailableItemIds.length > 0) {
    issues.push({
      code: 'CART_ITEM_UNAVAILABLE',
      message: 'Some items in your cart just went out of stock.',
      itemIds: hydrated.unavailableItemIds,
    });
  }

  if (hydrated.pricing.minOrderShortfall !== null) {
    issues.push({
      code: 'MIN_ORDER_NOT_MET',
      message: `Add \u20b9${hydrated.pricing.minOrderShortfall} more to meet the minimum order value.`,
      shortfall: hydrated.pricing.minOrderShortfall,
    });
  }

  return ok(
    {
      cart: toClientCart(hydrated),
      pricing: hydrated.pricing,
      issues,
      orderable: issues.length === 0,
    },
    requestId,
  );
});
