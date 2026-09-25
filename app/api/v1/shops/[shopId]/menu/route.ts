// app/api/v1/shops/[shopId]/menu/route.ts
// Public: the merchant's catalogue. Items are always returned with their stored
// price; the client never sends prices back, it only sends item ids.

import { ApiError } from '@/lib/server/errors';
import { okPublic, withApi } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export const GET = withApi<{ shopId: string }>(async ({ params, requestId }) => {
  const store = getStore();
  const shop = await store.getShop(params.shopId);
  if (!shop) throw new ApiError('NOT_FOUND', 'Merchant not found.');

  const [categories, items] = await Promise.all([
    store.listCategories(shop.id),
    store.listItems(shop.id),
  ]);

  return okPublic(
    {
      shop,
      categories: categories.sort((a, b) => a.display_order - b.display_order),
      items,
    },
    requestId,
    { sMaxAge: 20, staleWhileRevalidate: 60 },
  );
});
