// app/api/v1/admin/audit-logs/route.ts
// Fraud visibility: the audit trail existed but had no viewer — privileged
// abuse (PIN overrides, refunds, snoozes) was writable but unreadable.
// SUPER_ADMIN sees all; includes recent notification receipts for the pilot.

import { ok, withApi } from '@/lib/server/http';
import { requireActor } from '@/lib/server/rbac';
import { ApiError } from '@/lib/server/errors';
import { getStore } from '@/lib/server/store';
import { recentNotifyReceipts } from '@/lib/server/notify';

export const dynamic = 'force-dynamic';

export const GET = withApi(async ({ req, requestId }) => {
  const actor = await requireActor(req);
  if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'CAMPUS_ADMIN') {
    throw new ApiError('FORBIDDEN_TENANT');
  }
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 100) || 100, 200);
  const logs = await getStore().listAuditLogs(limit);
  // Campus admins only see their own campus trail.
  const scoped =
    actor.role === 'CAMPUS_ADMIN' && actor.campusId
      ? logs.filter((entry) => !entry.campus_id || entry.campus_id === actor.campusId)
      : logs;
  return ok({ logs: scoped, notifications: recentNotifyReceipts(50) }, requestId);
});
