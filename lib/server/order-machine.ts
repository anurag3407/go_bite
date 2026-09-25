// lib/server/order-machine.ts
// The single source of truth for legal order transitions (plan.md §10.1).
// Any transition not listed here is rejected with ORDER_INVALID_STATE, which is
// what prevents a shop from skipping straight from PLACED to DELIVERED.

import type { OrderStatus, UserRole } from '@/lib/types';
import { ApiError } from './errors';

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'DISPUTED'],
  DELIVERED: ['DISPUTED'],
  DISPUTED: ['DELIVERED', 'CANCELLED'],
  CANCELLED: [],
};

/** Terminal states can never be moved out of. */
export const TERMINAL_STATUSES: OrderStatus[] = ['CANCELLED'];

/** Statuses that count as "live" for shop queues and order caps. */
export const ACTIVE_STATUSES: OrderStatus[] = [
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'OUT_FOR_DELIVERY',
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new ApiError('ORDER_INVALID_STATE', undefined, { from, to });
  }
}

/**
 * Roles permitted to drive a given transition. Complements the transition table
 * so that, for example, a CUSTOMER cannot mark their own order ACCEPTED.
 */
export function allowedActors(to: OrderStatus): UserRole[] {
  switch (to) {
    case 'ACCEPTED':
      return ['SHOP_OWNER', 'SHOP_STAFF', 'SUPER_ADMIN'];
    case 'PREPARING':
    case 'OUT_FOR_DELIVERY':
      return ['SHOP_OWNER', 'SHOP_STAFF', 'SUPER_ADMIN'];
    case 'DELIVERED':
      return ['SHOP_OWNER', 'SHOP_STAFF', 'QUERY_RESOLVER', 'SUPER_ADMIN'];
    case 'CANCELLED':
      return ['CUSTOMER', 'SHOP_OWNER', 'SHOP_STAFF', 'QUERY_RESOLVER', 'SUPER_ADMIN', 'CAMPUS_ADMIN'];
    case 'DISPUTED':
      return ['CUSTOMER', 'SHOP_OWNER', 'SHOP_STAFF', 'QUERY_RESOLVER', 'SUPER_ADMIN'];
    default:
      return [];
  }
}

/** Customer self-cancellation window (plan.md §10.1): 120 seconds. */
export const CUSTOMER_CANCEL_WINDOW_MS = 120 * 1000;

export function withinCustomerCancelWindow(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() <= CUSTOMER_CANCEL_WINDOW_MS;
}

/** Window in which a delivered order may still be disputed (plan.md §10.1). */
export const DISPUTE_WINDOW_MS = 6 * 60 * 60 * 1000;

export function withinDisputeWindow(deliveredAt: string | undefined): boolean {
  if (!deliveredAt) return false;
  return Date.now() - new Date(deliveredAt).getTime() <= DISPUTE_WINDOW_MS;
}
