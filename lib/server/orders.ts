// lib/server/orders.ts
// Order lifecycle: placement, state transitions, delivery-PIN verification,
// cancellation and dispute handling. All money and all state moves are decided
// here on the server, never by the client.

import type { Order, OrderStatus, PaymentMethod, Shop } from '@/lib/types';
import { audit } from './audit';
import { clearCart, hydrateCart } from './cart';
import { PLATFORM_CONFIG } from './config';
import { paymentGatewayEnabled } from './env';
import { ApiError } from './errors';
import { assertRateLimit, keys, kv, runIdempotent } from './kv';
import { notifyOrder, orderCustomerPhone } from './notify';
import {
  ACTIVE_STATUSES,
  assertTransition,
  withinCustomerCancelWindow,
  withinDisputeWindow,
} from './order-machine';
import { assertOrderAccess, assertPermission, assertShopScope, requireCampus } from './rbac';
import { generateDeliveryPin, generateOrderNumber, timingSafeEqualStr } from './security';
import { serializeOrderForActor } from './serializers';
import type { Actor } from './session';
import { getStore } from './store';
import type { OrderStatusHistoryEntry } from './store/types';

const PIN_MAX_ATTEMPTS = 5;
const PIN_WINDOW_SECONDS = 15 * 60;

export interface CreateOrderInput {
  campusLocationId: string;
  roomOrFlat: string;
  landmark?: string;
  alternatePhone?: string;
  paymentMethod: PaymentMethod;
  specialInstructions?: string;
}

export interface CreateOrderResult {
  order: Order;
  replayed: boolean;
}

/**
 * Merchants must be open and not snoozed before they can receive an order.
 * A snooze whose window has elapsed is cleared here rather than leaving the
 * shop blocked forever by state nobody remembered to reset.
 */
async function assertShopOrderable(shop: Shop): Promise<void> {
  let current = shop;

  if (
    current.is_snoozed &&
    current.snoozed_until &&
    new Date(current.snoozed_until).getTime() <= Date.now()
  ) {
    const healed = await getStore().setShopStatus(current.id, {
      is_snoozed: false,
      snoozed_until: null,
    });
    if (healed) current = healed;
  }

  if (!current.is_open || current.is_snoozed) {
    throw new ApiError('SHOP_CLOSED', undefined, {
      shopId: current.id,
      snoozedUntil: current.snoozed_until ?? null,
    });
  }
}

/**
 * Places an order from the server-side cart.
 *
 * Idempotent: the same Idempotency-Key returns the original order rather than
 * creating a second one, which is what makes double-taps and retries on flaky
 * campus Wi-Fi safe (plan.md §7.6).
 */
export async function createOrder(
  actor: Actor,
  input: CreateOrderInput,
  idempotencyKey: string,
  ipAddress: string | null,
  idempotencyFingerprintValue?: string,
): Promise<CreateOrderResult> {
  assertPermission(actor, 'order:place');
  const campusId = requireCampus(actor);
  const store = getStore();

  const result = await runIdempotent(actor.userId, idempotencyKey, async () => {
    const campus = await store.getCampus(campusId);
    if (!campus) throw new ApiError('NOT_FOUND', 'Campus not found.');

    const hydrated = await hydrateCart(actor.userId, campusId);
    if (!hydrated) throw new ApiError('CART_EMPTY');
    if (hydrated.unavailableItemIds.length > 0) {
      throw new ApiError('CART_ITEM_UNAVAILABLE', undefined, {
        itemIds: hydrated.unavailableItemIds,
      });
    }

    const { shop, lines, pricing } = hydrated;
    await assertShopOrderable(shop);

    if (lines.length === 0) throw new ApiError('CART_EMPTY');

    if (pricing.minOrderShortfall !== null) {
      throw new ApiError('MIN_ORDER_NOT_MET', undefined, {
        shortfall: pricing.minOrderShortfall,
      });
    }

    // Payment: only cash is collectable without a gateway. Refusing explicitly
    // is what stops us from ever marking an uncollected payment as captured.
    if (input.paymentMethod !== 'CASH_ON_DELIVERY') {
      throw new ApiError(
        'PAYMENT_FAILED',
        paymentGatewayEnabled
          ? 'Online payment is not available in this release. Please choose Cash on Delivery.'
          : 'Online payments are not enabled yet. Please choose Cash on Delivery.',
        { supportedMethod: 'CASH_ON_DELIVERY' },
      );
    }
    if (pricing.total > PLATFORM_CONFIG.codMaxRupees) {
      throw new ApiError('PAYMENT_FAILED', `Cash on delivery is limited to \u20b9${PLATFORM_CONFIG.codMaxRupees} per order.`, {
        codMaxRupees: PLATFORM_CONFIG.codMaxRupees,
      });
    }

    // Customer-level live order cap: prevents accidental or abusive flooding of
    // a small campus kitchen.
    const existingOrders = await store.listOrdersByCustomer(actor.userId);
    const liveOrders = existingOrders.filter((order) => ACTIVE_STATUSES.includes(order.status));
    if (liveOrders.length >= PLATFORM_CONFIG.maxActiveOrdersPerCustomer) {
      throw new ApiError(
        'RATE_LIMITED',
        `You already have ${liveOrders.length} live orders. Wait for one to finish or cancel it.`,
        { reason: 'MAX_ACTIVE_ORDERS', maxActiveOrders: PLATFORM_CONFIG.maxActiveOrdersPerCustomer },
      );
    }

    const locations = await store.listCampusLocations(campusId);
    const location = locations.find((entry) => entry.id === input.campusLocationId);
    if (!location) {
      throw new ApiError('VALIDATION_ERROR', 'Choose a valid drop-off point for this campus.', {
        field: 'campusLocationId',
      });
    }

    const addressSummary = [
      location.name,
      input.roomOrFlat.trim(),
      input.landmark?.trim() ? `(near ${input.landmark.trim()})` : null,
    ]
      .filter(Boolean)
      .join(', ');

    const orderId = `ord-${crypto.randomUUID()}`;
    const estimateMinutes = shop.prep_time_minutes + 10;

    const order = await store.createOrder({
      id: orderId,
      order_number: generateOrderNumber(campus.code),
      campus_id: campusId,
      shop_id: shop.id,
      customer_id: actor.userId,
      address_id: null,
      address_summary: addressSummary,
      idempotency_key: idempotencyKey,
      status: 'PLACED',
      delivery_pin: generateDeliveryPin(),
      items_subtotal: pricing.itemsSubtotal,
      delivery_fee: pricing.deliveryFee,
      platform_fee: pricing.platformFee,
      tax_fee: pricing.taxFee,
      total_amount: pricing.total,
      special_instructions: input.specialInstructions?.trim() || null,
      estimated_delivery_time: new Date(Date.now() + estimateMinutes * 60_000).toISOString(),
      items: pricing.lines.map((line) => ({
        catalog_item_id: line.item.id,
        item_name: line.item.name,
        unit_price: line.unit_price,
        quantity: line.quantity,
        total_price: line.total_price,
      })),
      // Cash is collected on handover, so it starts (and stays) PENDING until
      // the PIN is verified — never optimistically "captured".
      payment: {
        payment_method: 'CASH_ON_DELIVERY',
        status: 'PENDING',
        amount: pricing.total,
      },
    });

    await store.appendStatusHistory({
      order_id: order.id,
      from_status: null,
      to_status: 'PLACED',
      actor_id: actor.userId,
      actor_role: actor.role,
      note: 'Order placed',
    });

    await clearCart(actor.userId);
    await audit({
      actor,
      action: 'ORDER_PLACED',
      entity: 'order',
      entityId: order.id,
      metadata: { shopId: shop.id, total: pricing.total, itemCount: lines.length },
      ipAddress,
    });

    // Best-effort SMS: shop must know instantly; customer gets confirmation.
    // Fire-and-forget — a dead SMS provider must never fail the order.
    const placed = { ...order, shop_name: shop.name, campus_name: campus.name };
    void notifyOrder(placed, 'ORDER_PLACED_SHOP', { phone: shop.phone ?? null, userId: null });
    void (async () => {
      const phone = await orderCustomerPhone(placed);
      await notifyOrder(placed, 'ORDER_ACCEPTED', { phone, userId: actor.userId });
    })();

    return order;
  }, 24 * 60 * 60, idempotencyFingerprintValue);

  return { order: serializeOrderForActor(result.value, actor), replayed: result.replayed };
}

export interface OrderDetail {
  order: Order;
  history: OrderStatusHistoryEntry[];
}

export async function getOrderForActor(actor: Actor, orderId: string): Promise<OrderDetail> {
  const store = getStore();
  const order = await store.getOrder(orderId);
  if (!order) throw new ApiError('NOT_FOUND');
  assertOrderAccess(actor, order);

  return {
    order: serializeOrderForActor(order, actor),
    history: await store.getOrderHistory(orderId),
  };
}

export async function listOrdersForActor(actor: Actor, statusFilter?: OrderStatus[]): Promise<Order[]> {
  const store = getStore();
  let orders: Order[];

  if (actor.role === 'SHOP_OWNER' || actor.role === 'SHOP_STAFF') {
    if (!actor.shopId) throw new ApiError('FORBIDDEN_TENANT', 'Your account is not linked to a shop.');
    orders = await store.listOrdersByShop(actor.shopId, statusFilter);
  } else if (actor.role === 'SUPER_ADMIN' || actor.role === 'CAMPUS_ADMIN' || actor.role === 'QUERY_RESOLVER') {
    // Admins see the orders of the campus they are operating in.
    const campusId = requireCampus(actor);
    const shops = await store.listShops(campusId);
    const perShop = await Promise.all(shops.map((shop) => store.listOrdersByShop(shop.id, statusFilter)));
    orders = perShop.flat().sort((a, b) => b.created_at.localeCompare(a.created_at));
  } else {
    orders = await store.listOrdersByCustomer(actor.userId);
  }

  return orders.map((order) => serializeOrderForActor(order, actor));
}

async function recordTransition(
  actor: Actor,
  order: Order,
  toStatus: OrderStatus,
  note: string,
  patch?: Partial<
    Pick<Order, 'delivered_at' | 'cancelled_at' | 'cancellation_reason' | 'estimated_delivery_time'>
  >,
): Promise<Order> {
  const store = getStore();
  const updated = await store.updateOrderStatus(order.id, toStatus, patch);
  await store.appendStatusHistory({
    order_id: order.id,
    from_status: order.status,
    to_status: toStatus,
    actor_id: actor.userId,
    actor_role: actor.role,
    note,
  });

  // Order events would be published to Redis Pub/Sub here for SSE fan-out
  // (plan.md §11). Without a broker the client polls order state instead.
  // SMS bridges the gap: the counterparty learns instantly either way.
  console.info('[order] status change', {
    orderId: order.id,
    from: order.status,
    to: toStatus,
    by: actor.role,
  });

  const moved = { ...updated, shop_name: undefined, campus_name: undefined };
  if (toStatus === 'ACCEPTED' || toStatus === 'OUT_FOR_DELIVERY') {
    const template = toStatus === 'ACCEPTED' ? 'ORDER_ACCEPTED' : 'OUT_FOR_DELIVERY';
    void (async () => {
      const phone = await orderCustomerPhone(moved);
      await notifyOrder(moved, template, { phone, userId: moved.customer_id });
    })();
  }
  if (toStatus === 'CANCELLED') {
    void (async () => {
      const phone = await orderCustomerPhone(moved);
      await notifyOrder(moved, 'ORDER_CANCELLED', { phone, userId: moved.customer_id });
    })();
  }

  return updated;
}

/** Merchant-driven transitions (accept → prepare → out for delivery). */
export async function advanceOrder(
  actor: Actor,
  orderId: string,
  toStatus: OrderStatus,
  ipAddress: string | null,
): Promise<Order> {
  const store = getStore();
  const order = await store.getOrder(orderId);
  if (!order) throw new ApiError('NOT_FOUND');

  const shop = await store.getShop(order.shop_id);
  if (!shop) throw new ApiError('NOT_FOUND');
  assertShopScope(actor, shop);
  assertPermission(actor, 'orders:accept');

  // DELIVERED is only reachable through PIN verification.
  if (toStatus === 'DELIVERED') {
    throw new ApiError('ORDER_INVALID_STATE', 'Verify the student\u2019s delivery PIN to complete this order.', {
      requiredEndpoint: 'verify-pin',
    });
  }

  assertTransition(order.status, toStatus);
  const updated = await recordTransition(actor, order, toStatus, `Merchant set ${toStatus}`);

  if (toStatus === 'ACCEPTED') {
    // Lock in a fresh estimate based on what the kitchen actually committed to.
    await store.updateOrderStatus(order.id, 'ACCEPTED', {
      estimated_delivery_time: new Date(Date.now() + (shop.prep_time_minutes + 10) * 60_000).toISOString(),
    });
  }

  await audit({
    actor,
    action: `ORDER_${toStatus}`,
    entity: 'order',
    entityId: order.id,
    metadata: { from: order.status, to: toStatus },
    ipAddress,
  });

  const fresh = await store.getOrder(order.id);
  return serializeOrderForActor(fresh ?? updated, actor);
}

/**
 * The only path to DELIVERED (plan.md §10.3). Constant-time compare, capped
 * attempts, and a lockout that routes the order to support rather than letting
 * it be brute-forced.
 */
export async function verifyDeliveryPin(
  actor: Actor,
  orderId: string,
  pin: string,
  ipAddress: string | null,
): Promise<Order> {
  const store = getStore();
  const order = await store.getOrder(orderId);
  if (!order) throw new ApiError('NOT_FOUND');

  const shop = await store.getShop(order.shop_id);
  if (!shop) throw new ApiError('NOT_FOUND');
  assertShopScope(actor, shop);
  assertPermission(actor, 'delivery:verify_pin');

  if (order.status !== 'OUT_FOR_DELIVERY') {
    throw new ApiError('ORDER_INVALID_STATE', 'This order is not out for delivery yet.', {
      status: order.status,
    });
  }

  // If the order should be marked locked, refuse outright.
  const lockedUntil = await kv.get(keys.pinAttempts(orderId));
  if (lockedUntil === 'LOCKED') {
    throw new ApiError('PIN_LOCKED', undefined, { requiresSupport: true });
  }

  await assertRateLimit('pinVerify', orderId);

  if (!order.delivery_pin || !timingSafeEqualStr(order.delivery_pin, pin)) {
    const attempts = Number((await kv.get(`${keys.pinAttempts(orderId)}:count`)) ?? '0') + 1;
    await kv.set(`${keys.pinAttempts(orderId)}:count`, String(attempts), PIN_WINDOW_SECONDS);

    if (attempts >= PIN_MAX_ATTEMPTS) {
      await kv.set(keys.pinAttempts(orderId), 'LOCKED', PIN_WINDOW_SECONDS * 4);
      await audit({
        actor,
        action: 'ORDER_PIN_LOCKED',
        entity: 'order',
        entityId: order.id,
        metadata: { attempts },
        ipAddress,
      });
      throw new ApiError('PIN_LOCKED', undefined, { requiresSupport: true });
    }

    throw new ApiError('PIN_MISMATCH', undefined, {
      attemptsRemaining: Math.max(PIN_MAX_ATTEMPTS - attempts, 0),
    });
  }

  const deliveredAt = new Date().toISOString();
  const updated = await recordTransition(actor, order, 'DELIVERED', 'Delivery PIN verified', {
    delivered_at: deliveredAt,
  });

  // Cash is collected at handover, so this is the point payment becomes real.
  if (updated.payment?.payment_method === 'CASH_ON_DELIVERY') {
    await store.updatePaymentStatus(order.id, 'CAPTURED');
  }

  await audit({
    actor,
    action: 'ORDER_DELIVERED',
    entity: 'order',
    entityId: order.id,
    metadata: {
      verifiedByShop: shop.id,
      verifiedByStaffId: actor.userId,
      verifiedByStaffName: actor.name,
      verifiedByStaffRole: actor.role,
    },
    ipAddress,
  });

  await kv.del(keys.pinAttempts(order.id));
  await kv.del(`${keys.pinAttempts(order.id)}:count`);

  const fresh = await store.getOrder(order.id);
  return serializeOrderForActor(fresh ?? updated, actor);
}

/**
 * Customer PIN rotation (P1 anti-social engineering control).
 * If a customer suspects someone overheard or snooped their PIN in a crowded
 * hostel hallway, they can rotate it up to 3 times before handover.
 */
export async function rotateDeliveryPin(
  actor: Actor,
  orderId: string,
  ipAddress: string | null,
): Promise<Order> {
  const store = getStore();
  const order = await store.getOrder(orderId);
  if (!order) throw new ApiError('NOT_FOUND');
  assertOrderAccess(actor, order);

  if (actor.role === 'CUSTOMER' && order.customer_id !== actor.userId) {
    throw new ApiError('NOT_FOUND');
  }

  if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
    throw new ApiError('ORDER_INVALID_STATE', 'Completed orders cannot have their PIN rotated.');
  }

  const rotationKey = `gb:order:${orderId}:pin_rotations`;
  const count = await kv.incr(rotationKey, 24 * 60 * 60);
  if (count > 3) {
    throw new ApiError('RATE_LIMITED', 'PIN can only be rotated up to 3 times per order.');
  }

  const newPin = generateDeliveryPin();
  const updated = await store.updateOrderPin(orderId, newPin);
  if (!updated) throw new ApiError('NOT_FOUND');

  // Clear any existing failed attempt lockouts for the old PIN
  await kv.del(keys.pinAttempts(orderId));
  await kv.del(`${keys.pinAttempts(orderId)}:count`);

  await audit({
    actor,
    action: 'DELIVERY_PIN_ROTATED',
    entity: 'order',
    entityId: order.id,
    metadata: { rotationNumber: count },
    ipAddress,
  });

  return serializeOrderForActor(updated, actor);
}

/** Customer cancellation, only inside the 120s window while still PLACED. */
export async function cancelOrder(
  actor: Actor,
  orderId: string,
  reason: string,
  ipAddress: string | null,
): Promise<Order> {
  const store = getStore();
  const order = await store.getOrder(orderId);
  if (!order) throw new ApiError('NOT_FOUND');
  assertOrderAccess(actor, order);

  if (actor.role === 'CUSTOMER') {
    if (order.customer_id !== actor.userId) throw new ApiError('NOT_FOUND');
    if (order.status !== 'PLACED') {
      throw new ApiError('ORDER_INVALID_STATE', 'This order has already been accepted and can no longer be cancelled here.');
    }
    if (!withinCustomerCancelWindow(order.created_at)) {
      throw new ApiError('ORDER_INVALID_STATE', 'The cancellation window for this order has passed. Raise a support ticket instead.');
    }
  }

  assertTransition(order.status, 'CANCELLED');

  const updated = await recordTransition(actor, order, 'CANCELLED', reason, {
    cancelled_at: new Date().toISOString(),
    cancellation_reason: reason,
  });

  if (updated.payment?.status === 'CAPTURED') {
    await store.updatePaymentStatus(order.id, 'REFUNDED');
    await audit({
      actor,
      action: 'REFUND_ISSUED',
      entity: 'order',
      entityId: order.id,
      metadata: { amount: updated.payment.amount, reason },
      ipAddress,
    });
  }

  await audit({
    actor,
    action: 'ORDER_CANCELLED',
    entity: 'order',
    entityId: order.id,
    metadata: { reason },
    ipAddress,
  });

  const fresh = await store.getOrder(order.id);
  return serializeOrderForActor(fresh ?? updated, actor);
}

/** Customer-raised dispute from OUT_FOR_DELIVERY or within 6h of DELIVERED. */
export async function openDispute(
  actor: Actor,
  orderId: string,
  note: string,
  ipAddress: string | null,
): Promise<Order> {
  const store = getStore();
  const order = await store.getOrder(orderId);
  if (!order) throw new ApiError('NOT_FOUND');
  assertOrderAccess(actor, order);

  if (order.status === 'DELIVERED' && !withinDisputeWindow(order.delivered_at)) {
    throw new ApiError('ORDER_INVALID_STATE', 'The dispute window for this order has closed. Please raise a support ticket.');
  }

  assertTransition(order.status, 'DISPUTED');
  const updated = await recordTransition(actor, order, 'DISPUTED', note || 'Dispute raised');

  await audit({
    actor,
    action: 'ORDER_DISPUTED',
    entity: 'order',
    entityId: order.id,
    metadata: { note },
    ipAddress,
  });

  const fresh = await store.getOrder(order.id);
  return serializeOrderForActor(fresh ?? updated, actor);
}

/**
 * Support override for a PIN that has been locked out — without this, a
 * legitimate delivery with a mistyped PIN would strand the order forever.
 * Fully audited, and only available to resolver/admin roles.
 */
export async function overrideDelivery(
  actor: Actor,
  orderId: string,
  note: string,
  ipAddress: string | null,
): Promise<Order> {
  const store = getStore();
  const order = await store.getOrder(orderId);
  if (!order) throw new ApiError('NOT_FOUND');
  assertOrderAccess(actor, order);
  assertPermission(actor, 'delivery:override');

  if (order.status !== 'OUT_FOR_DELIVERY') {
    throw new ApiError('ORDER_INVALID_STATE', undefined, { status: order.status });
  }

  const updated = await recordTransition(actor, order, 'DELIVERED', `Support override: ${note}`, {
    delivered_at: new Date().toISOString(),
  });

  if (updated.payment?.payment_method === 'CASH_ON_DELIVERY') {
    await store.updatePaymentStatus(order.id, 'CAPTURED');
  }

  await audit({
    actor,
    action: 'ORDER_DELIVERY_OVERRIDDEN',
    entity: 'order',
    entityId: order.id,
    metadata: { note },
    ipAddress,
  });

  await kv.del(keys.pinAttempts(order.id));
  await kv.del(`${keys.pinAttempts(order.id)}:count`);

  const fresh = await store.getOrder(order.id);
  return serializeOrderForActor(fresh ?? updated, actor);
}
