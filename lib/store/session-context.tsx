'use client';

// lib/store/session-context.tsx
// Client-side view of the authenticated session. This replaces the old
// free-for-all role switcher: a user's role now comes exclusively from their
// server-verified session, and the permissions attached to it are the same set
// the API enforces. UI gating here is cosmetic — the API is authoritative.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api-client';
import { ROLE_PERMISSIONS, type Permission } from '@/lib/auth';
import type { UserRole } from '@/lib/types';

export interface SessionUser {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  activeCampusId: string | null;
  shopId: string | null;
}

interface SessionResponse {
  user: SessionUser | null;
  permissions: string[];
  demoMode: boolean;
}

interface OtpRequestResponse {
  cooldownSec: number;
  devOtp?: string;
}

interface SessionContextType {
  user: SessionUser | null;
  permissions: string[];
  currentRole: UserRole;
  isLoading: boolean;
  /** True when no SMS provider is configured, so the OTP is shown in-app. */
  demoMode: boolean;
  can: (permission: Permission) => boolean;
  isStaff: boolean;
  refresh: () => Promise<void>;
  requestOtp: (phone: string) => Promise<OtpRequestResponse>;
  verifyOtp: (input: { phone: string; otp: string; name?: string; campusId?: string }) => Promise<SessionUser>;
  logout: () => Promise<void>;
  isAuthModalOpen: boolean;
  authModalReason: string | null;
  openAuthModal: (reason?: string) => void;
  closeAuthModal: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalReason, setAuthModalReason] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const session = await api.get<SessionResponse>('/api/v1/auth/session');
      setUser(session.user);
      setPermissions(session.permissions);
      setDemoMode(session.demoMode);
    } catch {
      // A failed session read must not present a signed-in-looking UI.
      setUser(null);
      setPermissions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    void Promise.resolve().then(async () => {
      if (isMounted) await refresh();
    });
    return () => {
      isMounted = false;
    };
  }, [refresh]);

  // Prompt for sign-in when the proxy bounced a deep link back to home.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'required') {
      void Promise.resolve().then(() => {
        setAuthModalReason('Sign in to continue to that area.');
        setIsAuthModalOpen(true);
      });
    }
  }, []);

  const requestOtp = useCallback(async (phone: string) => {
    return api.post<OtpRequestResponse>('/api/v1/auth/otp/request', { phone });
  }, []);

  const verifyOtp = useCallback<SessionContextType['verifyOtp']>(
    async (input) => {
      const result = await api.post<{ user: SessionUser; isNewUser: boolean }>(
        '/api/v1/auth/otp/verify',
        input,
      );
      setUser(result.user);
      setPermissions(ROLE_PERMISSIONS[result.user.role] ?? []);
      setIsAuthModalOpen(false);
      return result.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } finally {
      setUser(null);
      setPermissions([]);
      // Full reload so no server-rendered/role-scoped UI survives the sign-out.
      if (typeof window !== 'undefined') window.location.reload();
    }
  }, []);

  const can = useCallback(
    (permission: Permission) => permissions.includes(permission),
    [permissions],
  );

  const currentRole: UserRole = user?.role ?? 'CUSTOMER';
  const isStaff = currentRole !== 'CUSTOMER';

  const value = useMemo<SessionContextType>(
    () => ({
      user,
      permissions,
      currentRole,
      isLoading,
      demoMode,
      can,
      isStaff,
      refresh,
      requestOtp,
      verifyOtp,
      logout,
      isAuthModalOpen,
      authModalReason,
      openAuthModal: (reason?: string) => {
        setAuthModalReason(reason ?? null);
        setIsAuthModalOpen(true);
      },
      closeAuthModal: () => {
        setIsAuthModalOpen(false);
        setAuthModalReason(null);
      },
    }),
    [user, permissions, currentRole, isLoading, demoMode, can, isStaff, refresh, requestOtp, verifyOtp, logout, isAuthModalOpen, authModalReason],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
}
