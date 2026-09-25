// lib/server/rbac.ts
// Authorisation guards. Every route resolves an Actor then asserts the exact
// permission and tenant scope it needs (plan.md §6.2, §6.3). No route may read
// a session directly.

import type { NextRequest } from 'next/server';
import { can, type Permission } from '@/lib/auth';
import type { UserRole } from '@/lib/types';
import { ApiError } from './errors';
import { resolveActor, type Actor } from './session';

/** Resolves the actor or fails with UNAUTHORIZED. */
export async function requireActor(req: NextRequest): Promise<Actor> {
  const actor = await resolveActor(req);
  if (!actor) throw new ApiError('UNAUTHORIZED');
  return actor;
}

/** Resolves the actor and asserts a specific permission. */
export async function requirePermission(
  req: NextRequest,
  permission: Permission,
): Promise<Actor> {
  const actor = await requireActor(req);
  assertPermission(actor, permission);
  return actor;
}

export function assertPermission(actor: Actor, permission: Permission): void {
  if (!can(actor.role, permission)) {
    throw new ApiError('FORBIDDEN_TENANT', undefined, { required: permission, role: actor.role });
  }
}

export function requireRole(actor: Actor, roles: UserRole[]): void {
  if (!roles.includes(actor.role)) {
    throw new ApiError('FORBIDDEN_TENANT', undefined, { allowedRoles: roles, role: actor.role });
  }
}

/** Guarantees the actor has an active campus (plan.md CAMPUS_REQUIRED). */
export function requireCampus(actor: Actor): string {
  if (!actor.campusId) throw new ApiError('CAMPUS_REQUIRED');
  return actor.campusId;
}

/**
 * Confirms a resource belongs to the actor's campus. This is the core
 * multi-campus isolation guard: a student at IIT Patna can never read or mutate
 * IIT Kanpur data.
 */
export function assertCampus(actor: Actor, campusId: string): void {
  // Platform-wide roles operate across campuses by design.
  if (actor.role === 'SUPER_ADMIN') return;
  if (actor.campusId !== campusId) {
    throw new ApiError('CAMPUS_MISMATCH', undefined, { actorCampus: actor.campusId });
  }
}

/**
 * Confirms the actor may act on a specific shop. Staff are hard-scoped to their
 * own shop; campus admins may act within their campus.
 */
export function assertShopScope(actor: Actor, shop: { id: string; campus_id: string }): void {
  if (actor.role === 'SUPER_ADMIN') return;
  if (actor.role === 'CAMPUS_ADMIN') {
    assertCampus(actor, shop.campus_id);
    return;
  }
  if (actor.shopId !== shop.id) {
    throw new ApiError('FORBIDDEN_TENANT', 'You can only manage your own shop.', {
      shopId: actor.shopId,
    });
  }
}

/**
 * Confirms an actor may view an order: the owning customer, staff of the
 * order's shop, or an admin/resolver within the same campus.
 */
export function assertOrderAccess(actor: Actor, order: { customer_id: string; shop_id: string; campus_id: string }): void {
  if (actor.role === 'SUPER_ADMIN') return;
  if (actor.role === 'CAMPUS_ADMIN' || actor.role === 'QUERY_RESOLVER') {
    assertCampus(actor, order.campus_id);
    return;
  }
  if (actor.role === 'CUSTOMER' && order.customer_id === actor.userId) return;
  if ((actor.role === 'SHOP_OWNER' || actor.role === 'SHOP_STAFF') && order.shop_id === actor.shopId) return;

  // Deliberately opaque: do not reveal whether the order exists elsewhere.
  throw new ApiError('NOT_FOUND');
}
