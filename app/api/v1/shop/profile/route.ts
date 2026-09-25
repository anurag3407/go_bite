// app/api/v1/shop/profile/route.ts
// Merchant profile edits the dashboard needs: delivery fee, free-delivery
// threshold, prep time, UPI id. Previously shopProfileSchema existed with no
// route — owners could not change what the checkout actually charges.

import { ApiError } from '@/lib/server/errors';
import { ok, readJson, withApi } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { assertPermission, requireActor } from '@/lib/server/rbac';
import { clientIp } from '@/lib/server/session';
import { getStore } from '@/lib/server/store';
import { shopProfileUpdateSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const PATCH = withApi(async ({ req, requestId }) => {
  const actor = await requireActor(req);
  assertPermission(actor, 'menu:manage');
  if (!actor.shopId) throw new ApiError('FORBIDDEN_TENANT', 'Your account is not linked to a merchant.');

  const body = await readJson(req, shopProfileUpdateSchema);
  if (Object.keys(body).length === 0) throw new ApiError('VALIDATION_ERROR', 'Provide at least one field to update.');

  const shop = await getStore().updateShopProfile(actor.shopId, {
    ...(body.deliveryFee !== undefined ? { delivery_fee: body.deliveryFee } : {}),
    ...(body.minOrderForFreeDelivery !== undefined ? { min_order_for_free_delivery: body.minOrderForFreeDelivery } : {}),
    ...(body.prepTimeMinutes !== undefined ? { prep_time_minutes: body.prepTimeMinutes } : {}),
    ...(body.upiVpa !== undefined ? { upi_vpa: body.upiVpa || undefined } : {}),
  });
  if (!shop) throw new ApiError('NOT_FOUND');

  await audit({
    actor,
    action: 'SHOP_PROFILE_UPDATED',
    entity: 'shop',
    entityId: shop.id,
    metadata: { ...body },
    ipAddress: clientIp(req),
  });

  return ok({ shop }, requestId);
});
