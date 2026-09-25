// app/api/v1/campuses/[campusId]/shops/route.ts
// Public: merchants for a single campus. Campus isolation is explicit — the
// campusId is a first-class path parameter and every result is scoped to it, so
// there is no code path that can return cross-campus data (plan.md §5.2).

import { ApiError } from '@/lib/server/errors';
import { okPublic, withApi } from '@/lib/server/http';
import { healExpiredSnoozes } from '@/lib/server/shops';
import { getStore } from '@/lib/server/store';
import type { ServiceType } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SERVICE_TYPES: ServiceType[] = [
  'FOOD_DINING',
  'SALON_GROOMING',
  'LAUNDRY',
  'PRINT_STATIONERY',
  'CAMPUS_STORE',
];

export const GET = withApi<{ campusId: string }>(async ({ req, params, requestId }) => {
  const store = getStore();
  const campus = await store.getCampus(params.campusId);
  if (!campus || !campus.is_active) {
    throw new ApiError('NOT_FOUND', 'Campus not found.');
  }

  let shops = await healExpiredSnoozes(await store.listShops(campus.id));

  const serviceType = req.nextUrl.searchParams.get('serviceType');
  if (serviceType) {
    const type = serviceType.toUpperCase() as ServiceType;
    if (!SERVICE_TYPES.includes(type)) {
      throw new ApiError('VALIDATION_ERROR', 'Unknown serviceType filter.', {
        field: 'serviceType',
        allowed: SERVICE_TYPES,
      });
    }
    shops = shops.filter((shop) => shop.service_type === type);
  }

  if (req.nextUrl.searchParams.get('openNow') === 'true') {
    shops = shops.filter((shop) => shop.is_open && !shop.is_snoozed);
  }

  return okPublic({ campus, shops }, requestId, { sMaxAge: 20, staleWhileRevalidate: 60 });
});
