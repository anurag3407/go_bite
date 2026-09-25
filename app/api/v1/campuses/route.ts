// app/api/v1/campuses/route.ts
// Public: lists active campuses and, when coordinates are supplied, resolves
// which geofence the client is standing in (tier-1 in plan.md §5.2).

import { okPublic, withApi } from '@/lib/server/http';
import { parseCoordinate, resolveCampusForPoint } from '@/lib/server/geo';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export const GET = withApi(async ({ req, requestId }) => {
  const campuses = await getStore().listCampuses();

  const params = req.nextUrl.searchParams;
  const lat = parseCoordinate(params.get('lat'), 'lat');
  const lng = parseCoordinate(params.get('lng'), 'lng');

  const resolution =
    lat !== null && lng !== null
      ? resolveCampusForPoint(campuses, lat, lng)
      : { campusId: null, distanceMeters: null };

  return okPublic(
    {
      campuses,
      resolvedCampusId: resolution.campusId,
      resolvedDistanceMeters: resolution.distanceMeters,
    },
    requestId,
    { sMaxAge: 300, staleWhileRevalidate: 600 },
  );
});

