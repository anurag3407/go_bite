// lib/server/shops.ts
// Small shop-domain helpers shared by read paths.
//
// A snooze carries `snoozed_until`. If the window has elapsed and nobody has
// placed an order since (the only other place that heals it), the merchant
// stayed invisible to students forever. Healing on read makes the catalogue
// self-correcting; the update is idempotent and cheap.

import type { Shop } from '@/lib/types';
import { getStore } from './store';

export async function healExpiredSnoozes(shops: Shop[]): Promise<Shop[]> {
  const now = Date.now();
  const lapsed = shops.filter(
    (shop) => shop.is_snoozed && shop.snoozed_until && new Date(shop.snoozed_until).getTime() <= now,
  );
  if (lapsed.length === 0) return shops;

  const store = getStore();
  const healed = new Map<string, Shop>();
  await Promise.all(
    lapsed.map(async (shop) => {
      const updated = await store.setShopStatus(shop.id, { is_snoozed: false, snoozed_until: null });
      if (updated) healed.set(shop.id, updated);
    }),
  );

  return shops.map((shop) => healed.get(shop.id) ?? shop);
}
