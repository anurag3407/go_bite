// lib/server/pricing.ts
// Server-authoritative pricing (plan.md §7.4, §9.4). Prices are NEVER trusted
// from the client — the cart is re-priced against the live catalogue at
// checkout. Arithmetic runs in integer paise so no float drift can occur, then
// is converted back to rupees at the API boundary.

import type { CatalogItem, Shop } from '@/lib/types';

/** Flat campus platform fee: ₹5. */
export const PLATFORM_FEE_PAISE = 500;

/** Upper bound on a single line quantity, so carts cannot be weaponised. */
export const MAX_LINE_QUANTITY = 20;

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

export interface CartLine {
  item: CatalogItem;
  quantity: number;
}

export interface PricedLine {
  item: CatalogItem;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface PricingResult {
  lines: PricedLine[];
  itemsSubtotal: number;
  deliveryFee: number;
  platformFee: number;
  taxFee: number;
  total: number;
  /** Rupees still needed to reach the shop minimum, or null when satisfied. */
  minOrderShortfall: number | null;
}

/** Effective selling price of an item, in paise. */
export function effectivePricePaise(item: CatalogItem): number {
  return toPaise(item.discounted_price ?? item.price);
}

/**
 * Computes the full bill for a set of validated lines. Delivery is only charged
 * for delivery-enabled merchants, and is waived above the free-delivery
 * threshold. Non-delivery services (salon, laundry collection) are never
 * charged a delivery fee.
 */
export function priceCart(lines: CartLine[], shop: Shop): PricingResult {
  const pricedLines: PricedLine[] = lines.map(({ item, quantity }) => {
    const unitPaise = effectivePricePaise(item);
    return {
      item,
      quantity,
      unit_price: fromPaise(unitPaise),
      total_price: fromPaise(unitPaise * quantity),
    };
  });

  const itemsSubtotalPaise = pricedLines.reduce(
    (sum, line) => sum + toPaise(line.total_price),
    0,
  );

  let deliveryFeePaise = 0;
  if (shop.delivery_enabled) {
    const threshold = shop.min_order_for_free_delivery;
    const qualifiesForFree =
      typeof threshold === 'number' && itemsSubtotalPaise >= toPaise(threshold);
    deliveryFeePaise = qualifiesForFree ? 0 : toPaise(shop.delivery_fee);
  }

  const platformFeePaise = pricedLines.length > 0 ? PLATFORM_FEE_PAISE : 0;
  const taxFeePaise = 0; // GST is settled off-platform in the pilot.
  const totalPaise = itemsSubtotalPaise + deliveryFeePaise + platformFeePaise + taxFeePaise;
  const itemsSubtotal = fromPaise(itemsSubtotalPaise);

  return {
    lines: pricedLines,
    itemsSubtotal,
    deliveryFee: fromPaise(deliveryFeePaise),
    platformFee: fromPaise(platformFeePaise),
    taxFee: fromPaise(taxFeePaise),
    total: fromPaise(totalPaise),
    minOrderShortfall: minOrderShortfall(shop, itemsSubtotal),
  };
}

/**
 * Minimum-order gate. Only applies to delivery merchants with a minimum order requirement set —
 * an in-person salon booking or standard food order without a minimum must not be blocked.
 * Free delivery threshold (min_order_for_free_delivery) only controls shipping fee waiving.
 */
export function minOrderShortfall(shop: Shop, itemsSubtotal: number): number | null {
  if (!shop.delivery_enabled) return null;
  const minimum = shop.min_order_amount;
  if (typeof minimum !== 'number' || minimum <= 0) return null;
  const shortfall = fromPaise(toPaise(minimum) - toPaise(itemsSubtotal));
  return shortfall > 0 ? shortfall : null;
}
