'use client';

import React from 'react';
import { useCart } from '@/lib/store/cart-context';
import { useCampus } from '@/lib/store/campus-context';
import { Home, Clock, ShoppingBag, MapPin } from 'lucide-react';

interface BottomNavProps {
  activeTab: 'home' | 'orders';
  setActiveTab: (tab: 'home' | 'orders') => void;
}

export function BottomNav({ activeTab, setActiveTab }: BottomNavProps) {
  const { itemsCount, total, setIsCartDrawerOpen, orders, setActiveTrackingOrder } = useCart();
  const { setIsCampusSelectorOpen } = useCampus();

  const activeOrders = orders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
  const latestOrder = activeOrders[0];

  return (
    <>
      {/* Floating Bottom Cart Bar on Mobile when items exist */}
      {itemsCount > 0 && (
        <div className="fixed bottom-16 left-0 right-0 p-3 z-30 lg:hidden animate-in slide-in-from-bottom-4">
          <button
            onClick={() => setIsCartDrawerOpen(true)}
            className="w-full bg-[#E95322] hover:bg-[#D44213] text-white p-3.5 rounded-2xl font-black text-sm flex items-center justify-between shadow-xl shadow-[#E95322]/30 transition active:scale-98"
          >
            <div className="flex items-center gap-2">
              <span className="bg-[#391713] text-white text-xs px-2.5 py-1 rounded-xl">
                {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
              </span>
              <span className="font-semibold text-xs text-white/90">View Cart & Checkout</span>
            </div>
            <div className="text-sm font-black">₹{total} →</div>
          </button>
        </div>
      )}

      {/* Main Bottom Navigation Bar (Figma Frame 56) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#F1E9E4] lg:hidden h-16 flex items-center justify-around px-2 shadow-lg">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition ${
            activeTab === 'home' ? 'text-[#E95322] font-black' : 'text-[#7A6A65] font-semibold'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px]">Home</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('orders');
            if (latestOrder) setActiveTrackingOrder(latestOrder);
          }}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition relative ${
            activeTab === 'orders' ? 'text-[#E95322] font-black' : 'text-[#7A6A65] font-semibold'
          }`}
        >
          <div className="relative">
            <Clock className="w-5 h-5" />
            {activeOrders.length > 0 && (
              <span className="absolute -top-1 -right-2 bg-[#E95322] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                {activeOrders.length}
              </span>
            )}
          </div>
          <span className="text-[10px]">Tracking</span>
        </button>

        <button
          onClick={() => setIsCartDrawerOpen(true)}
          className="flex flex-col items-center justify-center gap-1 flex-1 py-1 text-[#7A6A65] font-semibold relative"
        >
          <div className="relative">
            <ShoppingBag className="w-5 h-5" />
            {itemsCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-[#E95322] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                {itemsCount}
              </span>
            )}
          </div>
          <span className="text-[10px]">Cart</span>
        </button>

        <button
          onClick={() => setIsCampusSelectorOpen(true)}
          className="flex flex-col items-center justify-center gap-1 flex-1 py-1 text-[#7A6A65] font-semibold"
        >
          <MapPin className="w-5 h-5 text-[#E95322]" />
          <span className="text-[10px]">Campus</span>
        </button>
      </nav>
    </>
  );
}
