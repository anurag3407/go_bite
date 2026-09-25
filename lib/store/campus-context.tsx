'use client';

// lib/store/campus-context.tsx
// Campus list and active-campus selection now come from the API. The selection
// is persisted on the user row (authoritative, cross-device) and mirrored to
// localStorage when signed out, instead of being client-only state.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '@/lib/api-client';
import { useSession } from '@/lib/store/session-context';
import type { Campus } from '@/lib/types';

const LOCAL_KEY = 'gobite_campus_id';

interface CampusListResponse {
  campuses: Campus[];
  resolvedCampusId: string | null;
  resolvedDistanceMeters: number | null;
}

export interface DetectionResult {
  campus: Campus | null;
  distanceMeters: number | null;
}

interface CampusContextType {
  activeCampus: Campus | null;
  allCampuses: Campus[];
  isLoading: boolean;
  error: string | null;
  setActiveCampus: (campus: Campus) => Promise<void>;
  reload: () => Promise<void>;
  detectCampusByLocation: () => Promise<DetectionResult>;
  isCampusSelectorOpen: boolean;
  setIsCampusSelectorOpen: (open: boolean) => void;
}

const CampusContext = createContext<CampusContextType | undefined>(undefined);

export function CampusProvider({ children }: { children: React.ReactNode }) {
  const { user, refresh: refreshSession } = useSession();
  const [allCampuses, setAllCampuses] = useState<Campus[]>([]);
  const [activeCampus, setActiveCampusState] = useState<Campus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCampusSelectorOpen, setIsCampusSelectorOpen] = useState(false);

  const loadCampuses = useCallback(async () => {
    try {
      const data = await api.get<CampusListResponse>('/api/v1/campuses');
      setAllCampuses(data.campuses);
      setError(null);
      return data.campuses;
    } catch (err) {
      setError(errorMessage(err));
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    setIsLoading(true);
    await loadCampuses();
  }, [loadCampuses]);

  useEffect(() => {
    let isMounted = true;
    void Promise.resolve().then(async () => {
      if (isMounted) await loadCampuses();
    });
    return () => {
      isMounted = false;
    };
  }, [loadCampuses]);

  // Resolve which campus to activate: the user's saved campus wins, then the
  // last device-local choice, then the first available campus.
  useEffect(() => {
    if (allCampuses.length === 0) return;
    let isMounted = true;

    void Promise.resolve().then(() => {
      if (!isMounted) return;
      const fromSession = user?.activeCampusId
        ? allCampuses.find((campus) => campus.id === user.activeCampusId)
        : undefined;

      const stored =
        typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_KEY) : null;
      const fromLocal = stored ? allCampuses.find((campus) => campus.id === stored) : undefined;

      const next = fromSession ?? fromLocal ?? allCampuses[0];
      if (next) {
        setActiveCampusState((current) => (current?.id === next.id ? current : next));
      }
    });

    return () => {
      isMounted = false;
    };
  }, [allCampuses, user?.activeCampusId]);

  const setActiveCampus = useCallback(
    async (campus: Campus) => {
      setActiveCampusState(campus);
      setIsCampusSelectorOpen(false);
      if (typeof window !== 'undefined') window.localStorage.setItem(LOCAL_KEY, campus.id);

      if (user) {
        try {
          await api.post('/api/v1/users/me/campus', { campusId: campus.id });
          await refreshSession();
        } catch (err) {
          // Selection still applies for this device even if persistence failed.
          setError(errorMessage(err));
        }
      }
    },
    [user, refreshSession],
  );

  /**
   * Geofence detection. Only ever called from an explicit user action, so the
   * browser location prompt is never triggered on page load.
   */
  const detectCampusByLocation = useCallback(async (): Promise<DetectionResult> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return { campus: null, distanceMeters: null };
    }

    const position = await new Promise<GeolocationPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (value) => resolve(value),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
      );
    });

    if (!position) return { campus: null, distanceMeters: null };

    const { latitude, longitude } = position.coords;
    const data = await api.get<CampusListResponse>(
      `/api/v1/campuses?lat=${latitude}&lng=${longitude}`,
    );

    return {
      campus: data.resolvedCampusId
        ? (data.campuses.find((campus) => campus.id === data.resolvedCampusId) ?? null)
        : null,
      distanceMeters: data.resolvedDistanceMeters,
    };
  }, []);

  const value = useMemo<CampusContextType>(
    () => ({
      activeCampus,
      allCampuses,
      isLoading,
      error,
      setActiveCampus,
      reload,
      detectCampusByLocation,
      isCampusSelectorOpen,
      setIsCampusSelectorOpen,
    }),
    [
      activeCampus,
      allCampuses,
      isLoading,
      error,
      setActiveCampus,
      reload,
      detectCampusByLocation,
      isCampusSelectorOpen,
    ],
  );

  return <CampusContext.Provider value={value}>{children}</CampusContext.Provider>;
}

export function useCampus() {
  const context = useContext(CampusContext);
  if (!context) throw new Error('useCampus must be used within a CampusProvider');
  return context;
}
