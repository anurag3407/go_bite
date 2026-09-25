// app/api/v1/support/tickets/[id]/route.ts
// Resolver triage: INVESTIGATING → RESOLVED / REJECTED with a written note.
// Every resolution is audited; resolving a linked DISPUTED order's ticket
// with status RESOLVED does not itself move the order — the shop or support
// override endpoint does that, so money and state stay in one place.

import { ApiError } from '@/lib/server/errors';
import { ok, readJson, withApi } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { requirePermission } from '@/lib/server/rbac';
import { clientIp } from '@/lib/server/session';
import { getStore } from '@/lib/server/store';
import { resolveTicketSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const PATCH = withApi<{ id: string }>(async ({ req, params, requestId }) => {
  const actor = await requirePermission(req, 'tickets:resolve');
  const body = await readJson(req, resolveTicketSchema);
  const store = getStore();

  const existing = (await store.listTickets({})).find((t) => t.id === params.id);
  if (!existing) throw new ApiError('NOT_FOUND');

  // Campus-scoped resolvers only triage their own campus queue.
  if (actor.role !== 'SUPER_ADMIN' && actor.campusId && existing.order_id) {
    const order = await store.getOrder(existing.order_id);
    if (order && order.campus_id !== actor.campusId) throw new ApiError('NOT_FOUND');
  }

  const ticket = await store.resolveTicket(params.id, {
    status: body.status,
    resolution_notes: body.resolution ?? null,
    assigned_to: actor.userId,
  });
  if (!ticket) throw new ApiError('NOT_FOUND');

  await audit({
    actor,
    action: 'TICKET_RESOLVED',
    entity: 'support_ticket',
    entityId: ticket.id,
    metadata: { status: ticket.status, orderId: ticket.order_id },
    ipAddress: clientIp(req),
  });

  return ok({ ticket }, requestId);
});
