// app/api/v1/admin/dues/route.ts
// COD settlement report: who collected how much cash at the counter, and what
// platform fee each shop owes. Without this, the ₹5/order fee is unenforceable
// — money the platform earned but cannot invoice.

import { ok, withApi } from '@/lib/server/http';
import { requireActor, requireCampus } from '@/lib/server/rbac';
import { ApiError } from '@/lib/server/errors';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export const GET = withApi(async ({ req, requestId }) => {
  const actor = await requireActor(req);
  if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'CAMPUS_ADMIN') {
    throw new ApiError('FORBIDDEN_TENANT');
  }
  const campusId = actor.role === 'SUPER_ADMIN' ? (req.nextUrl.searchParams.get('campusId') ?? requireCampus(actor)) : requireCampus(actor);
  const since = req.nextUrl.searchParams.get('since') ?? undefined;

  const store = getStore();
  const dues = await store.duesByCampus(campusId, since);
  const withNames = await Promise.all(
    dues.map(async (entry) => {
      const shop = await store.getShop(entry.shopId);
      return { ...entry, shopName: shop?.name ?? entry.shopId };
    }),
  );
  const totals = withNames.reduce(
    (sum, entry) => ({
      deliveredOrders: sum.deliveredOrders + entry.deliveredOrders,
      codCollected: sum.codCollected + entry.codCollected,
      platformFeesOwed: sum.platformFeesOwed + entry.platformFeesOwed,
      grossVolume: sum.grossVolume + entry.grossVolume,
      refundedOrders: sum.refundedOrders + entry.refundedOrders,
      refundedAmount: sum.refundedAmount + entry.refundedAmount,
    }),
    { deliveredOrders: 0, codCollected: 0, platformFeesOwed: 0, grossVolume: 0, refundedOrders: 0, refundedAmount: 0 },
  );

  return ok({ campusId, since: since ?? null, dues: withNames, totals }, requestId);
});
