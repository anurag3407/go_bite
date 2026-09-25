// lib/server/serializers.ts
// Response shaping. The delivery PIN is the platform's anti-dispute guarantee
// (plan.md §10.3): if a merchant can read it, the whole mechanism is void.
// It is therefore stripped for every actor except the owning customer.

import type { Order } from '@/lib/types';
import type { Actor } from './session';

/** True when this actor is the customer who placed the order. */
export function isOwningCustomer(order: Pick<Order, 'customer_id'>, actor: Actor): boolean {
  return actor.role === 'CUSTOMER' && order.customer_id === actor.userId;
}

/**
 * Returns the order as this actor is allowed to see it. Non-owners never
 * receive `delivery_pin`, regardless of role.
 */
export function serializeOrderForActor(order: Order, actor: Actor): Order {
  if (isOwningCustomer(order, actor)) return order;

  const redacted: Order = { ...order };
  delete redacted.delivery_pin;
  return redacted;
}

export function serializeOrdersForActor(orders: Order[], actor: Actor): Order[] {
  return orders.map((order) => serializeOrderForActor(order, actor));
}
