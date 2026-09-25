// app/api/v1/shops/[shopId]/route.ts
// Public: one merchant's profile, including its live open/snoozed status.

import { ApiError } from '@/lib/server/errors';
import { okPublic, withApi } from '@/lib/server/http';
import { healExpiredSnoozes } from '@/lib/server/shops';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export const GET = withApi<{ shopId: string }>(async ({ params, requestId }) => {
  const store = getStore();
  const found = await store.getShop(params.shopId);
  if (!found) throw new ApiError('NOT_FOUND', 'Merchant not found.');

  // Never expose a lapsed snooze as "closed forever".
  const [shop] = await healExpiredSnoozes([found]);
  const campus = await store.getCampus(shop.campus_id);

  return okPublic(
    {
      shop: {
        ...shop,
        // Derived so clients do not have to reason about stale snooze flags.
        is_accepting_orders: shop.is_open && !shop.is_snoozed,
      },
      campus,
    },
    requestId,
    { sMaxAge: 10, staleWhileRevalidate: 30 },
  );
});
