// lib/server/audit.ts
// Every privileged action is written to audit_logs (plan.md §8 table 12) so
// refunds, status overrides and config changes are attributable.

import type { Actor } from './session';
import { getStore } from './store';

export interface AuditInput {
  actor: Actor;
  action: string;
  entity: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function audit(input: AuditInput): Promise<void> {
  const { actor, action, entity, entityId } = input;
  await getStore().writeAudit({
    actor_id: actor.userId,
    actor_role: actor.role,
    campus_id: actor.campusId,
    action,
    entity,
    entity_id: entityId,
    metadata: input.metadata ?? {},
    ip_address: input.ipAddress ?? null,
  });
}
