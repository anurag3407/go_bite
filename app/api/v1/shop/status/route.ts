// app/api/v1/shop/status/route.ts
// Merchant open/close and kitchen snooze. Snoozing with a duration records a
// wake time, so the shop reopens automatically instead of staying shut because
// nobody remembered to switch it back on.

import { ApiError } from '@/lib/server/errors';
import { ok, readJson, withApi } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { assertPermission, requireActor } from '@/lib/server/rbac';
import { clientIp } from '@/lib/server/session';
import { getStore } from '@/lib/server/store';
import { shopStatusSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const POST = withApi(async ({ req, requestId }) => {
  const actor = await requireActor(req);
  assertPermission(actor, 'shop:open_close');
  if (!actor.shopId) throw new ApiError('FORBIDDEN_TENANT', 'Your account is not linked to a merchant.');

  const body = await readJson(req, shopStatusSchema);
  const store = getStore();

  const patch: { is_open?: boolean; is_snoozed?: boolean; snoozed_until?: string | null } = {};

  if (body.snoozeMinutes !== undefined) {
    patch.is_snoozed = true;
    patch.snoozed_until = new Date(Date.now() + body.snoozeMinutes * 60_000).toISOString();
  } else if (body.isOpen !== undefined) {
    patch.is_open = body.isOpen;
    // Opening the shop always clears a lingering snooze.
    if (body.isOpen) {
      patch.is_snoozed = false;
      patch.snoozed_until = null;
    }
  }

  const shop = await store.setShopStatus(actor.shopId, patch);
  if (!shop) throw new ApiError('NOT_FOUND');

  await audit({
    actor,
    action: 'SHOP_STATUS_UPDATED',
    entity: 'shop',
    entityId: shop.id,
    metadata: { ...patch },
    ipAddress: clientIp(req),
  });

  return ok({ shop }, requestId);
});
