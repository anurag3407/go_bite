'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Campus } from '@/lib/types';
import { MOCK_CAMPUSES } from '@/lib/mock-data';

interface CampusContextType {
  activeCampus: Campus;
  allCampuses: Campus[];
  setActiveCampus: (campus: Campus) => void;
  isCampusSelectorOpen: boolean;
  setIsCampusSelectorOpen: (open: boolean) => void;
}

const CampusContext = createContext<CampusContextType | undefined>(undefined);

export function CampusProvider({ children }: { children: React.ReactNode }) {
  const [activeCampus, setActiveCampusState] = useState<Campus>(MOCK_CAMPUSES[0]); // default to IIT Patna (Bihta)
  const [isCampusSelectorOpen, setIsCampusSelectorOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('gobite_campus_id');
    if (saved) {
      const match = MOCK_CAMPUSES.find((c) => c.id === saved);
      if (match) setActiveCampusState(match);
    }
  }, []);

  const setActiveCampus = (campus: Campus) => {
    setActiveCampusState(campus);
    localStorage.setItem('gobite_campus_id', campus.id);
    setIsCampusSelectorOpen(false);
  };

  return (
    <CampusContext.Provider
      value={{
        activeCampus,
        allCampuses: MOCK_CAMPUSES,
        setActiveCampus,
        isCampusSelectorOpen,
        setIsCampusSelectorOpen,
      }}
    >
      {children}
    </CampusContext.Provider>
  );
}

export function useCampus() {
  const context = useContext(CampusContext);
  if (!context) {
    throw new Error('useCampus must be used within a CampusProvider');
  }
  return context;
}
