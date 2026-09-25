'use client';

// lib/hooks/use-catalog.ts
// Loads the campus catalogue from the API: the campus's merchants plus each
// merchant's menu. Prices are never computed here — items carry the server's
// stored price and the server re-prices at checkout.

import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api-client';
import type { CatalogCategory, CatalogItem, Shop } from '@/lib/types';

interface ShopsResponse {
  shops: Shop[];
}

interface MenuResponse {
  categories: CatalogCategory[];
  items: CatalogItem[];
}

export interface CatalogData {
  shops: Shop[];
  items: CatalogItem[];
  categories: CatalogCategory[];
}

export function useCatalog(campusId: string | null | undefined) {
  const [data, setData] = useState<CatalogData>({ shops: [], items: [], categories: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!campusId) {
        setData({ shops: [], items: [], categories: [] });
        return;
      }

      setIsLoading(true);
      try {
        const { shops } = await api.get<ShopsResponse>(`/api/v1/campuses/${campusId}/shops`, {
          signal,
        });

        // Menus are fetched per merchant so a single failing menu cannot blank
        // the whole storefront.
        const menus = await Promise.all(
          shops.map(async (shop) => {
            try {
              return await api.get<MenuResponse>(`/api/v1/shops/${shop.id}/menu`, { signal });
            } catch {
              return { categories: [], items: [] } as MenuResponse;
            }
          }),
        );

        setData({
          shops,
          items: menus.flatMap((menu) => menu.items),
          categories: menus.flatMap((menu) => menu.categories),
        });
        setError(null);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(errorMessage(err));
        setData({ shops: [], items: [], categories: [] });
      } finally {
        setIsLoading(false);
      }
    },
    [campusId],
  );

  useEffect(() => {
    const controller = new AbortController();
    // Started from an async IIFE so state is only touched after the request
    // settles, never synchronously during the effect pass.
    void (async () => {
      await load(controller.signal);
    })();
    return () => controller.abort();
  }, [load]);

  return {
    ...data,
    isLoading,
    error,
    reload: () => load(),
  };
}
