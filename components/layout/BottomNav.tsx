'use client';

// components/layout/BottomNav.tsx
// Mobile navigation. Order counts come from the server-backed order list, and
// the tab selection lives in the shared UI context so the header and nav cannot
// disagree about which tab is active.

import React from 'react';
import { useCart } from '@/lib/store/cart-context';
import { useCampus } from '@/lib/store/campus-context';
import { useUi } from '@/lib/store/ui-context';
import { Home, Clock, ShoppingBag, MapPin } from 'lucide-react';

export function BottomNav() {
  const { itemsCount, orders, setActiveTrackingOrder, setIsCartDrawerOpen, cart } = useCart();
  const { setIsCampusSelectorOpen } = useCampus();
  const { mobileTab, setMobileTab } = useUi();

  const activeOrders = orders.filter(
    (order) => order.status !== 'DELIVERED' && order.status !== 'CANCELLED',
  );
  const latestOrder = activeOrders[0];
  const total = cart?.pricing.total ?? 0;

  return (
    <>
      {itemsCount > 0 && cart ? (
        <div className="fixed bottom-16 left-0 right-0 p-3 z-30 lg:hidden">
          <button
            type="button"
            onClick={() => setIsCartDrawerOpen(true)}
            className="w-full bg-[#FF6161] hover:bg-[#EE4D4D] text-white p-3.5 rounded-2xl font-black text-sm flex items-center justify-between shadow-xl shadow-[#FF6161]/30 transition"
          >
            <span className="flex items-center gap-2">
              <span className="bg-[#1E1E24] text-white text-xs px-2.5 py-1 rounded-xl">
                {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
              </span>
              <span className="font-semibold text-xs text-white/90">View Cart &amp; Checkout</span>
            </span>
            <span className="text-sm font-black">₹{total} →</span>
          </button>
        </div>
      ) : null}

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#F2ECE9] lg:hidden h-16 flex items-center justify-around px-2 shadow-lg">
        <button
          type="button"
          onClick={() => setMobileTab('home')}
          aria-current={mobileTab === 'home' ? 'page' : undefined}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition ${
            mobileTab === 'home' ? 'text-[#FF6161] font-black' : 'text-[#7E7E8B] font-semibold'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px]">Home</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMobileTab('orders');
            if (latestOrder) setActiveTrackingOrder(latestOrder);
          }}
          aria-current={mobileTab === 'orders' ? 'page' : undefined}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition ${
            mobileTab === 'orders' ? 'text-[#FF6161] font-black' : 'text-[#7E7E8B] font-semibold'
          }`}
        >
          <span className="relative">
            <Clock className="w-5 h-5" />
            {activeOrders.length > 0 ? (
              <span className="absolute -top-1 -right-2 bg-[#FF6161] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                {activeOrders.length}
              </span>
            ) : null}
          </span>
          <span className="text-[10px]">Tracking</span>
        </button>

        <button
          type="button"
          onClick={() => setIsCartDrawerOpen(true)}
          className="flex flex-col items-center justify-center gap-1 flex-1 py-1 text-[#7E7E8B] font-semibold"
        >
          <span className="relative">
            <ShoppingBag className="w-5 h-5" />
            {itemsCount > 0 ? (
              <span className="absolute -top-1 -right-2 bg-[#FF6161] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                {itemsCount}
              </span>
            ) : null}
          </span>
          <span className="text-[10px]">Cart</span>
        </button>

        <button
          type="button"
          onClick={() => setIsCampusSelectorOpen(true)}
          className="flex flex-col items-center justify-center gap-1 flex-1 py-1 text-[#7E7E8B] font-semibold"
        >
          <MapPin className="w-5 h-5 text-[#FF6161]" />
          <span className="text-[10px]">Campus</span>
        </button>
      </nav>
    </>
  );
}
