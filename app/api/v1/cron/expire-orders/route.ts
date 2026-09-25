// app/api/v1/cron/expire-orders/route.ts
// Order timeout worker without a worker: cancels PLACED orders older than 10
// min so ignored orders strand neither the student nor the kitchen.
// Trigger: Vercel Cron / cron-job.org / `*/2 * * * * curl` with CRON_SECRET.
// Without the secret it 401s — never expose auto-cancel to the public.

import { ok, withApi } from '@/lib/server/http';
import { ApiError } from '@/lib/server/errors';
import { getStore } from '@/lib/server/store';
import { notifyOrder, orderCustomerPhone } from '@/lib/server/notify';

export const dynamic = 'force-dynamic';
export const ORDER_TIMEOUT_MS = 10 * 60 * 1000;

export const POST = withApi(async ({ req, requestId }) => {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? req.nextUrl.searchParams.get('secret');
  if (!secret || provided !== secret) throw new ApiError('UNAUTHORIZED', 'Invalid cron secret.');

  const store = getStore();
  const cutoff = new Date(Date.now() - ORDER_TIMEOUT_MS).toISOString();
  const stale = await store.listStalePlacedOrders(cutoff, 100);

  let expired = 0;
  for (const order of stale) {
    // Re-read: a shop may have accepted between listing and cancelling.
    const current = await store.getOrder(order.id);
    if (!current || current.status !== 'PLACED') continue;
    await store.updateOrderStatus(order.id, 'CANCELLED', {
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'Merchant did not accept within 10 minutes (auto-cancelled).',
    });
    await store.appendStatusHistory({
      order_id: order.id,
      from_status: 'PLACED',
      to_status: 'CANCELLED',
      actor_id: null,
      actor_role: null,
      note: 'Auto-cancelled: no merchant response in 10 min',
    });
    await store.writeAudit({
      actor_id: 'system',
      actor_role: 'SUPER_ADMIN',
      campus_id: order.campus_id,
      action: 'ORDER_AUTO_CANCELLED',
      entity: 'order',
      entity_id: order.id,
      metadata: { orderNumber: order.order_number, placedAt: order.created_at },
      ip_address: null,
    });
    const cancelled = (await store.getOrder(order.id)) ?? order;
    void (async () => {
      const phone = await orderCustomerPhone(cancelled);
      await notifyOrder(cancelled, 'ORDER_CANCELLED', { phone, userId: cancelled.customer_id });
    })();
    expired += 1;
  }

  return ok({ checked: stale.length, expired }, requestId);
});
