'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useCampus } from '@/lib/store/campus-context';
import { useCart } from '@/lib/store/cart-context';
import { useRole } from '@/lib/store/role-context';
import { UserRole } from '@/lib/types';
import { 
  MapPin, 
  ShoppingBag, 
  Clock, 
  Search, 
  ChevronDown, 
  ShieldCheck, 
  User, 
  Sparkles,
  Store,
  Headphones,
  SlidersHorizontal
} from 'lucide-react';

export function Header() {
  const { activeCampus, setIsCampusSelectorOpen } = useCampus();
  const { itemsCount, total, setIsCartDrawerOpen, orders, setActiveTrackingOrder } = useCart();
  const { currentRole, setCurrentRole } = useRole();
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);

  const activeOrdersCount = orders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length;
  const latestActiveOrder = orders.find((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED');

  const roles: { role: UserRole; label: string; icon: any; color: string }[] = [
    { role: 'CUSTOMER', label: 'Student / Customer', icon: User, color: 'text-orange-600' },
    { role: 'SHOP_OWNER', label: 'Shop Owner / Canteen', icon: Store, color: 'text-amber-600' },
    { role: 'QUERY_RESOLVER', label: 'Query Resolver (Support)', icon: Headphones, color: 'text-blue-600' },
    { role: 'SUPER_ADMIN', label: 'Super Admin', icon: ShieldCheck, color: 'text-purple-600' },
    { role: 'CONFIG_CHANGER', label: 'Config Changer', icon: SlidersHorizontal, color: 'text-emerald-600' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#F1E9E4]">
      {/* Top Banner Alert / Strategy notice */}
      <div className="bg-[#391713] text-[#FFDECF] px-4 py-1.5 text-xs font-medium flex items-center justify-between">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-[#E95322] text-white px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide">
              CAMPUS CONCIERGE
            </span>
            <span className="hidden sm:inline">Hyperlocal deliveries & errands directly to your hostel gate.</span>
          </div>
          
          {/* Demo Role Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
              className="flex items-center gap-1.5 bg-[#4D231E] hover:bg-[#5C2B25] text-white px-2.5 py-0.5 rounded-full text-xs font-semibold transition"
            >
              <span className="text-[#FFB800]">Portal Role:</span>
              <span className="underline decoration-[#FFB800]">{roles.find(r => r.role === currentRole)?.label}</span>
              <ChevronDown className="w-3 h-3 text-[#FFDECF]" />
            </button>

            {isRoleDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-[#F1E9E4] py-2 z-50 text-[#391713]">
                <div className="px-3 py-1.5 text-[11px] font-bold text-[#7A6A65] uppercase tracking-wider">
                  Switch Active Portal Demo
                </div>
                {roles.map(({ role, label, icon: Icon, color }) => (
                  <button
                    key={role}
                    onClick={() => {
                      setCurrentRole(role);
                      setIsRoleDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2.5 text-xs font-medium hover:bg-[#FAF7F5] transition ${
                      currentRole === role ? 'bg-[#FFF4EF] font-bold text-[#E95322]' : 'text-[#391713]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${color}`} />
                    <span>{label}</span>
                    {currentRole === role && <span className="ml-auto text-[#E95322] text-xs">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Header Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4">
        {/* Logo & Campus Selector */}
        <div className="flex items-center gap-4 sm:gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#E95322] to-[#FF7A45] flex items-center justify-center text-white font-black text-xl shadow-md shadow-[#E95322]/20 group-hover:scale-105 transition">
              GB
            </div>
            <div className="flex flex-col">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-[#391713] leading-none">
                Go<span className="text-[#E95322]">Bite</span>
              </span>
              <span className="text-[10px] font-semibold text-[#7A6A65] tracking-widest uppercase">
                Campus Concierge
              </span>
            </div>
          </Link>

          {/* Campus Selector Pill */}
          <button
            onClick={() => setIsCampusSelectorOpen(true)}
            className="flex items-center gap-2 bg-[#FAF7F5] hover:bg-[#FFF4EF] border border-[#F1E9E4] hover:border-[#E95322] px-3 sm:px-4 py-2 rounded-2xl text-xs sm:text-sm font-semibold text-[#391713] transition group"
          >
            <div className="w-6 h-6 rounded-full bg-[#FFDECF] flex items-center justify-center text-[#E95322]">
              <MapPin className="w-3.5 h-3.5 text-[#E95322]" />
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-[10px] text-[#7A6A65] leading-none">Campus</div>
              <div className="font-bold text-[#391713] group-hover:text-[#E95322] transition truncate max-w-[140px] md:max-w-[180px]">
                {activeCampus.name}
              </div>
            </div>
            <span className="sm:hidden font-bold">{activeCampus.code}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#7A6A65] group-hover:text-[#E95322]" />
          </button>
        </div>

        {/* Search Bar (Desktop) */}
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A6A65]" />
            <input
              type="text"
              placeholder="Search shakes, maggi, burgers, salon haircut..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#FAF7F5] border border-[#F1E9E4] text-xs font-medium focus:outline-none focus:border-[#E95322] focus:bg-white transition"
            />
          </div>
        </div>

        {/* Action Buttons: Tracking & Cart */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Active Orders Tracker Pill */}
          {activeOrdersCount > 0 && latestActiveOrder && (
            <button
              onClick={() => setActiveTrackingOrder(latestActiveOrder)}
              className="flex items-center gap-2 bg-[#FFF4EF] hover:bg-[#FFDECF] border border-[#E95322]/40 text-[#E95322] px-3 sm:px-4 py-2 rounded-2xl text-xs font-bold transition animate-pulse"
            >
              <Clock className="w-4 h-4 text-[#E95322]" />
              <span className="hidden sm:inline">Active Order</span>
              <span className="bg-[#E95322] text-white text-[10px] px-2 py-0.5 rounded-full font-black">
                PIN: {latestActiveOrder.delivery_pin}
              </span>
            </button>
          )}

          {/* Cart Button */}
          <button
            onClick={() => setIsCartDrawerOpen(true)}
            className="flex items-center gap-2.5 bg-[#E95322] hover:bg-[#D44213] text-white px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm shadow-md shadow-[#E95322]/25 transition"
          >
            <div className="relative">
              <ShoppingBag className="w-4 h-4" />
              {itemsCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-[#391713] text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {itemsCount}
                </span>
              )}
            </div>
            <span className="hidden sm:inline font-bold">Cart</span>
            {itemsCount > 0 && (
              <span className="border-l border-white/30 pl-2 text-xs font-semibold">
                ₹{total}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
