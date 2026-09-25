// lib/server/cart.ts
// Server-side cart (plan.md §7.4). Stored per user in the KV layer rather than
// on the device, so a cart started on a library desktop can be finished on a
// phone, and prices can never be tampered with client-side.
//
// A cart is validated and re-priced against the live catalogue on every read
// that matters for money (checkout), never trusting client-supplied prices.

import type { CartLineView, CartView, CatalogItem, Shop } from '@/lib/types';
import { ApiError } from './errors';
import { keys, kv } from './kv';
import { MAX_LINE_QUANTITY, priceCart, type CartLine, type PricingResult } from './pricing';
import { getStore } from './store';

const CART_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface CartLineInput {
  itemId: string;
  quantity: number;
}

export interface ServerCart {
  shopId: string;
  campusId: string;
  items: CartLineInput[];
  specialInstructions?: string;
  updatedAt: string;
}

export interface HydratedCart {
  cart: ServerCart;
  shop: Shop;
  lines: CartLine[];
  /** Item ids in the cart that are no longer orderable. */
  unavailableItemIds: string[];
  pricing: PricingResult;
}

/** Shapes a hydrated cart for the client, carrying the server's own pricing. */
export function toClientCart(hydrated: HydratedCart): CartView {
  const items: CartLineView[] = hydrated.pricing.lines.map((line) => ({
    item: line.item,
    quantity: line.quantity,
    unit_price: line.unit_price,
    total_price: line.total_price,
  }));

  return {
    shopId: hydrated.shop.id,
    shopName: hydrated.shop.name,
    shop: hydrated.shop,
    items,
    pricing: hydrated.pricing,
    unavailableItemIds: hydrated.unavailableItemIds,
    specialInstructions: hydrated.cart.specialInstructions,
    updatedAt: hydrated.cart.updatedAt,
  };
}

async function readCart(userId: string): Promise<ServerCart | null> {
  const raw = await kv.get(keys.cart(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServerCart;
  } catch {
    // Corrupt payload must not wedge the user's cart forever.
    await kv.del(keys.cart(userId));
    return null;
  }
}

async function writeCart(userId: string, cart: ServerCart): Promise<void> {
  await kv.set(keys.cart(userId), JSON.stringify(cart), CART_TTL_SECONDS);
}

export async function clearCart(userId: string): Promise<void> {
  await kv.del(keys.cart(userId));
}

/**
 * Adds (or increments) an item. Enforces the single-shop rule and rejects
 * closed shops and out-of-stock items before they ever reach the cart.
 */
export async function addCartItem(
  userId: string,
  campusId: string,
  shop: Shop,
  item: CatalogItem,
  quantity: number,
): Promise<ServerCart> {
  if (!shop.is_open || shop.is_snoozed) {
    throw new ApiError('SHOP_CLOSED', undefined, { shopId: shop.id });
  }
  if (!item.is_available) {
    throw new ApiError('CART_ITEM_UNAVAILABLE', undefined, { itemId: item.id });
  }
  if (shop.campus_id !== campusId) {
    throw new ApiError('CAMPUS_MISMATCH');
  }

  const existing = await readCart(userId);

  if (existing && existing.shopId !== shop.id) {
    // Return the current cart so the client can offer "replace cart?" (§7.4).
    throw new ApiError('CART_CONFLICT_SINGLE_SHOP', undefined, {
      currentShopId: existing.shopId,
      currentItems: existing.items,
    });
  }

  const items: CartLineInput[] = existing ? [...existing.items] : [];
  const index = items.findIndex((line) => line.itemId === item.id);

  if (quantity <= 0) {
    if (index >= 0) items.splice(index, 1);
  } else if (index >= 0) {
    items[index] = { itemId: item.id, quantity: Math.min(quantity, MAX_LINE_QUANTITY) };
  } else {
    items.push({ itemId: item.id, quantity: Math.min(quantity, MAX_LINE_QUANTITY) });
  }

  if (items.length === 0) {
    await clearCart(userId);
    return { shopId: shop.id, campusId, items: [], updatedAt: new Date().toISOString() };
  }

  const cart: ServerCart = {
    shopId: shop.id,
    campusId,
    items,
    specialInstructions: existing?.specialInstructions,
    updatedAt: new Date().toISOString(),
  };
  await writeCart(userId, cart);
  return cart;
}

export async function removeCartItem(userId: string, itemId: string): Promise<ServerCart | null> {
  const existing = await readCart(userId);
  if (!existing) return null;

  const items = existing.items.filter((line) => line.itemId !== itemId);
  if (items.length === 0) {
    await clearCart(userId);
    return null;
  }

  const cart: ServerCart = { ...existing, items, updatedAt: new Date().toISOString() };
  await writeCart(userId, cart);
  return cart;
}

export async function setSpecialInstructions(userId: string, instructions: string): Promise<void> {
  const existing = await readCart(userId);
  if (!existing) return;
  await writeCart(userId, { ...existing, specialInstructions: instructions });
}

/**
 * Joins the stored cart with the live catalogue and re-prices it server-side.
 * Returns null when the cart is empty.
 */
export async function hydrateCart(userId: string, campusId: string): Promise<HydratedCart | null> {
  const cart = await readCart(userId);
  if (!cart || cart.items.length === 0) return null;

  const store = getStore();
  const shop = await store.getShop(cart.shopId);
  if (!shop) {
    // The merchant vanished (unboarded/deleted) — do not leave a zombie cart.
    await clearCart(userId);
    return null;
  }

  const items = await store.getItemsByIds(cart.items.map((line) => line.itemId));
  const itemsById = new Map(items.map((item) => [item.id, item]));

  const lines: CartLine[] = [];
  const unavailableItemIds: string[] = [];

  for (const line of cart.items) {
    const item = itemsById.get(line.itemId);
    if (!item || item.shop_id !== shop.id) {
      unavailableItemIds.push(line.itemId);
      continue;
    }
    if (!item.is_available) {
      unavailableItemIds.push(line.itemId);
      continue;
    }
    lines.push({ item, quantity: line.quantity });
  }

  // Surface cross-campus leakage loudly rather than silently serving data.
  if (cart.campusId !== campusId) {
    await clearCart(userId);
    throw new ApiError('CAMPUS_MISMATCH', 'Your cart belonged to a different campus and was cleared.');
  }

  return {
    cart,
    shop,
    lines,
    unavailableItemIds,
    pricing: priceCart(lines, shop),
  };
}
