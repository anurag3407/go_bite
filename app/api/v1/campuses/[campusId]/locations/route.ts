// app/api/v1/campuses/[campusId]/locations/route.ts
// Public: the drop-off points a student can choose at checkout. Checkout
// validates the chosen id against this same list server-side, so a client cannot
// invent a delivery destination.

import { ApiError } from '@/lib/server/errors';
import { ok, withApi } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export const GET = withApi<{ campusId: string }>(async ({ params, requestId }) => {
  const store = getStore();
  const campus = await store.getCampus(params.campusId);
  if (!campus || !campus.is_active) throw new ApiError('NOT_FOUND', 'Campus not found.');

  const locations = await store.listCampusLocations(campus.id);
  return ok({ locations }, requestId);
});
