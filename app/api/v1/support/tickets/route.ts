// app/api/v1/support/tickets/route.ts
// Customer ticket desk. Creating a ticket is the only way an order leaves the
// customer's hands after the 120s cancel window — without this, stranded
// orders had no escalation path. Resolvers triage via the sibling [id] route.

import { ok, readJson, withApi } from '@/lib/server/http';
import { ApiError } from '@/lib/server/errors';
import { audit } from '@/lib/server/audit';
import { requireActor } from '@/lib/server/rbac';
import { clientIp } from '@/lib/server/session';
import { getStore } from '@/lib/server/store';
import { createTicketSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const GET = withApi(async ({ req, requestId }) => {
  const actor = await requireActor(req);
  const store = getStore();
  const status = req.nextUrl.searchParams.get('status') ?? undefined;

  if (actor.role === 'CUSTOMER') {
    const tickets = await store.listTickets({ customerId: actor.userId, status });
    return ok({ tickets }, requestId);
  }

  // Staff see their campus queue.
  if (!actor.campusId) throw new ApiError('CAMPUS_REQUIRED');
  const tickets = await store.listTickets({ campusId: actor.campusId, status });
  return ok({ tickets }, requestId);
});

export const POST = withApi(async ({ req, requestId }) => {
  const actor = await requireActor(req);
  const body = await readJson(req, createTicketSchema);
  const store = getStore();

  if (body.orderId) {
    const order = await store.getOrder(body.orderId);
    if (!order) throw new ApiError('NOT_FOUND');
    const isOwner = order.customer_id === actor.userId;
    const sameCampusStaff =
      actor.role !== 'CUSTOMER' && actor.campusId !== null && order.campus_id === actor.campusId;
    if (!isOwner && !sameCampusStaff && actor.role !== 'SUPER_ADMIN') {
      throw new ApiError('NOT_FOUND');
    }
  }

  const ticket = await store.createTicket({
    order_id: body.orderId ?? null,
    customer_id: actor.userId,
    subject: body.subject,
    body: body.body,
  });

  await audit({
    actor,
    action: 'TICKET_CREATED',
    entity: 'support_ticket',
    entityId: ticket.id,
    metadata: { orderId: body.orderId ?? null, subject: body.subject },
    ipAddress: clientIp(req),
  });

  return ok({ ticket }, requestId, { status: 201 });
});
