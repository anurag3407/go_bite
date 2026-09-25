'use client';

// components/layout/Header.tsx
// Two security problems were fixed here:
//   1. the public "Portal Role" dropdown let any visitor become SUPER_ADMIN with
//      one click — roles now come only from a verified session
//   2. the active-order pill printed the delivery PIN in the header for anyone
//      to read, which defeated the entire anti-dispute mechanism
// The search field was also decorative; it now actually filters the catalogue.

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useCampus } from '@/lib/store/campus-context';
import { useCart } from '@/lib/store/cart-context';
import { useSession } from '@/lib/store/session-context';
import { useUi } from '@/lib/store/ui-context';
import {
  ChevronDown,
  Clock,
  LogIn,
  LogOut,
  MapPin,
  Search,
  ShoppingBag,
  User,
  X,
} from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: 'Student',
  SHOP_OWNER: 'Shop Owner',
  SHOP_STAFF: 'Shop Staff',
  CAMPUS_ADMIN: 'Campus Admin',
  SUPER_ADMIN: 'Super Admin',
  CONFIG_CHANGER: 'Config Changer',
  QUERY_RESOLVER: 'Support',
};

export function Header() {
  const { activeCampus, isLoading: isCampusLoading, setIsCampusSelectorOpen } = useCampus();
  const { itemsCount, orders, setActiveTrackingOrder, setIsCartDrawerOpen } = useCart();
  const { user, currentRole, openAuthModal, logout, isLoading: isSessionLoading } = useSession();
  const { searchQuery, setSearchQuery } = useUi();
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  const activeOrders = orders.filter(
    (order) => order.status !== 'DELIVERED' && order.status !== 'CANCELLED',
  );
  const latestActiveOrder = activeOrders[0];

  // Close the account menu on outside click or Escape.
  useEffect(() => {
    if (!isAccountOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setIsAccountOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsAccountOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isAccountOpen]);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#F2ECE9]">
      <div className="bg-[#1E1E24] text-[#FFECEB] px-4 py-1.5 text-xs font-medium">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="bg-[#FF6161] text-white px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide shrink-0">
              CAMPUS CONCIERGE
            </span>
            <span className="hidden sm:inline truncate">
              Hyperlocal deliveries &amp; errands directly to your hostel gate.
            </span>
          </div>

          {/* Account / sign-in */}
          <div className="relative shrink-0" ref={accountRef}>
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsAccountOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={isAccountOpen}
                  className="flex items-center gap-1.5 bg-[#2A2A31] hover:bg-[#34343D] text-white px-2.5 py-0.5 rounded-full text-xs font-semibold transition"
                >
                  <User className="w-3 h-3 text-[#F59E0B]" />
                  <span className="max-w-[110px] truncate">{user.name}</span>
                  <span className="hidden sm:inline text-[#F59E0B]">
                    · {ROLE_LABELS[currentRole] ?? currentRole}
                  </span>
                  <ChevronDown className="w-3 h-3 text-[#FFECEB]" />
                </button>

                {isAccountOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-60 bg-white rounded-2xl shadow-2xl border border-[#F2ECE9] py-2 z-50 text-[#1E1E24]"
                  >
                    <div className="px-3 py-1.5">
                      <div className="text-[11px] font-bold text-[#7E7E8B] uppercase tracking-wider">
                        Signed in
                      </div>
                      <div className="text-xs font-black truncate">{user.name}</div>
                      <div className="text-[11px] text-[#7E7E8B]">+91-{user.phone}</div>
                      <div className="text-[11px] text-[#FF6161] font-bold">
                        {ROLE_LABELS[currentRole] ?? currentRole}
                      </div>
                    </div>
                    <div className="border-t border-[#F2ECE9] mt-1 pt-1">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsAccountOpen(false);
                          void logout();
                        }}
                        className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign out
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal()}
                disabled={isSessionLoading}
                className="flex items-center gap-1.5 bg-[#FF6161] hover:bg-[#EE4D4D] text-white px-3 py-1 rounded-full text-xs font-black transition disabled:opacity-60"
              >
                <LogIn className="w-3 h-3" />
                Sign in
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 sm:gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#FF6161] to-[#FF8585] flex items-center justify-center text-white font-black text-xl shadow-md shadow-[#FF6161]/20 group-hover:scale-105 transition">
              GB
            </div>
            <div className="flex flex-col">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-[#1E1E24] leading-none">
                Go<span className="text-[#FF6161]">Bite</span>
              </span>
              <span className="text-[10px] font-semibold text-[#7E7E8B] tracking-widest uppercase">
                Campus Concierge
              </span>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setIsCampusSelectorOpen(true)}
            className="flex items-center gap-2 bg-[#FAF6F4] hover:bg-[#FFF5F4] border border-[#F2ECE9] hover:border-[#FF6161] px-3 sm:px-4 py-2 rounded-2xl text-xs sm:text-sm font-semibold text-[#1E1E24] transition group"
          >
            <span className="w-6 h-6 rounded-full bg-[#FFECEB] flex items-center justify-center">
              <MapPin className="w-3.5 h-3.5 text-[#FF6161]" />
            </span>
            <span className="text-left hidden sm:block">
              <span className="block text-[10px] text-[#7E7E8B] leading-none">Campus</span>
              <span className="block font-bold text-[#1E1E24] group-hover:text-[#FF6161] transition truncate max-w-[140px] md:max-w-[180px]">
                {isCampusLoading ? 'Loading…' : (activeCampus?.name ?? 'Select campus')}
              </span>
            </span>
            <span className="sm:hidden font-bold">{activeCampus?.code ?? '—'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#7E7E8B] group-hover:text-[#FF6161]" />
          </button>
        </div>

        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7E7E8B]" />
            <label htmlFor="catalog-search" className="sr-only">
              Search the campus catalogue
            </label>
            <input
              id="catalog-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search shakes, maggi, burgers, salon haircut..."
              className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-[#FAF6F4] border border-[#F2ECE9] text-xs font-medium focus:outline-none focus:border-[#FF6161] focus:bg-white transition"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7E7E8B] hover:text-[#1E1E24]"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* NOTE: deliberately shows no PIN — the code must only ever be visible
              on the ordering student's own tracking screen. */}
          {activeOrders.length > 0 && latestActiveOrder ? (
            <button
              type="button"
              onClick={() => setActiveTrackingOrder(latestActiveOrder)}
              className="flex items-center gap-2 bg-[#FFF5F4] hover:bg-[#FFECEB] border border-[#FF6161]/40 text-[#FF6161] px-3 sm:px-4 py-2 rounded-2xl text-xs font-bold transition"
            >
              <Clock className="w-4 h-4 text-[#FF6161]" />
              <span className="hidden sm:inline">
                {activeOrders.length === 1 ? 'Track Order' : `${activeOrders.length} Live Orders`}
              </span>
              <span className="bg-[#FF6161] text-white text-[10px] px-2 py-0.5 rounded-full font-black">
                {latestActiveOrder.status.replace(/_/g, ' ')}
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setIsCartDrawerOpen(true)}
            className="flex items-center gap-2.5 bg-[#FF6161] hover:bg-[#EE4D4D] text-white px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm shadow-md shadow-[#FF6161]/25 transition"
          >
            <span className="relative">
              <ShoppingBag className="w-4 h-4" />
              {itemsCount > 0 ? (
                <span className="absolute -top-2 -right-2 bg-[#1E1E24] text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {itemsCount}
                </span>
              ) : null}
            </span>
            <span className="hidden sm:inline font-bold">Cart</span>
          </button>
        </div>
      </div>
    </header>
  );
}
