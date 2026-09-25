// lib/server/geo.ts
// Campus geofence resolution (plan.md §5.2). The plan uses a Redis GEO tier for
// the hot path; without Redis this computes the nearest campus with the
// haversine formula over the campus list, which is O(#campuses) and accurate.
// The GeoIndex interface is the seam a Redis GEOSEARCH driver plugs into.

import type { Campus } from '@/lib/types';

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GeoResolution {
  campusId: string | null;
  distanceMeters: number | null;
}

/**
 * Resolves the campus whose geofence contains (or is nearest to) the given
 * point. Returns null when the point is outside every campus radius, in which
 * case the client must fall back to explicit campus selection.
 */
export function resolveCampusForPoint(
  campuses: Campus[],
  lat: number,
  lng: number,
): GeoResolution {
  let best: { id: string; distance: number } | null = null;

  for (const campus of campuses) {
    const distance = haversineMeters(lat, lng, campus.center_lat, campus.center_lng);
    if (!best || distance < best.distance) {
      best = { id: campus.id, distance };
    }
  }

  if (!best) return { campusId: null, distanceMeters: null };

  const campus = campuses.find((entry) => entry.id === best!.id);
  const radius = campus?.radius_meters ?? 0;
  if (best.distance > radius) {
    return { campusId: null, distanceMeters: Math.round(best.distance) };
  }

  return { campusId: best.id, distanceMeters: Math.round(best.distance) };
}

export function parseCoordinate(value: string | null, kind: 'lat' | 'lng'): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (kind === 'lat' && (parsed < -90 || parsed > 90)) return null;
  if (kind === 'lng' && (parsed < -180 || parsed > 180)) return null;
  return parsed;
}
