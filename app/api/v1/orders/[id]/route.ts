// app/api/v1/orders/[id]/route.ts
// Authenticated: order detail, visible only to the owning customer, the shop's
// staff, or campus-scoped admins/support. The delivery PIN is redacted for
// everyone except the owning customer.

import { ok, withApi } from '@/lib/server/http';
import { getOrderForActor } from '@/lib/server/orders';
import { requireActor } from '@/lib/server/rbac';

export const dynamic = 'force-dynamic';

export const GET = withApi<{ id: string }>(async ({ req, params, requestId }) => {
  const actor = await requireActor(req);
  const { order, history } = await getOrderForActor(actor, params.id);
  return ok({ order, history }, requestId);
});
