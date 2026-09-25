// app/api/v1/orders/route.ts
// POST is idempotent (plan.md §9.5): the Idempotency-Key header makes retries
// and double-taps safe. GET returns the orders the caller is allowed to see.

import { ApiError } from '@/lib/server/errors';
import { ok, readIdempotencyKey, readJson, withApi } from '@/lib/server/http';
import { assertRateLimit } from '@/lib/server/kv';
import { createOrder, listOrdersForActor } from '@/lib/server/orders';
import { requireActor } from '@/lib/server/rbac';
import { clientIp } from '@/lib/server/session';
import { idempotencyFingerprint } from '@/lib/server/security';
import { createOrderSchema, orderStatusSchema } from '@/lib/server/validation';
import type { OrderStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

function parseStatusFilter(values: string[]): OrderStatus[] | undefined {
  if (values.length === 0) return undefined;

  const statuses: OrderStatus[] = [];
  for (const value of values) {
    const parsed = orderStatusSchema.safeParse(value.toUpperCase());
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', 'Unknown status filter.', { field: 'status', value });
    }
    statuses.push(parsed.data);
  }
  return statuses;
}

export const GET = withApi(async ({ req, requestId }) => {
  const actor = await requireActor(req);
  const statuses = parseStatusFilter(req.nextUrl.searchParams.getAll('status'));
  const orders = await listOrdersForActor(actor, statuses);
  return ok({ orders }, requestId);
});

export const POST = withApi(async ({ req, requestId }) => {
  const actor = await requireActor(req);
  const idempotencyKey = readIdempotencyKey(req);
  const body = await readJson(req, createOrderSchema);

  await assertRateLimit('orderCreate', actor.userId);

  // Bind the key to this exact cart+destination: retries replay, key reuse
  // across different carts 409s instead of returning the wrong order.
  const fingerprint = idempotencyFingerprint({
    cart: 'server-cart',
    campusLocationId: body.campusLocationId,
    roomOrFlat: body.roomOrFlat.trim().toLowerCase(),
    landmark: body.landmark?.trim().toLowerCase() ?? null,
    paymentMethod: body.paymentMethod,
    specialInstructions: body.specialInstructions?.trim() ?? null,
  });

  const { order, replayed } = await createOrder(actor, body, idempotencyKey, clientIp(req), fingerprint);

  const response = ok({ order }, requestId);
  if (replayed) response.headers.set('Idempotency-Replayed', 'true');
  return response;
});
