'use client';

// lib/store/ui-context.tsx
// Small amount of shared UI state (search text, mobile tab) so the header,
// page and bottom nav stay in sync without prop drilling. Search used to be a
// decorative input with no state at all — it now actually filters the catalogue.

import React, { createContext, useContext, useMemo, useState } from 'react';

export type MobileTab = 'home' | 'orders';

interface UiContextType {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  mobileTab: MobileTab;
  setMobileTab: (tab: MobileTab) => void;
}

const UiContext = createContext<UiContextType | undefined>(undefined);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileTab, setMobileTab] = useState<MobileTab>('home');

  const value = useMemo(
    () => ({ searchQuery, setSearchQuery, mobileTab, setMobileTab }),
    [searchQuery, mobileTab],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const context = useContext(UiContext);
  if (!context) throw new Error('useUi must be used within a UiProvider');
  return context;
}
