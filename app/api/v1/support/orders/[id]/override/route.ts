// app/api/v1/support/orders/[id]/override/route.ts
// Support-only completion for an order whose PIN attempts are exhausted
// (plan.md §9.7). Without this, a legitimate delivery with a mistyped PIN would
// strand the order permanently. Fully audited and campus-scoped.

import { ok, readJson, withApi } from '@/lib/server/http';
import { overrideDelivery } from '@/lib/server/orders';
import { requirePermission } from '@/lib/server/rbac';
import { clientIp } from '@/lib/server/session';
import { supportOverrideSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const POST = withApi<{ id: string }>(async ({ req, params, requestId }) => {
  const actor = await requirePermission(req, 'delivery:override');
  const body = await readJson(req, supportOverrideSchema);

  const order = await overrideDelivery(actor, params.id, body.note, clientIp(req));
  return ok({ order }, requestId);
});
