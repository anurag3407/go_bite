'use client';

import React, { useState } from 'react';
import { useCampus } from '@/lib/store/campus-context';
import { useCart } from '@/lib/store/cart-context';
import { useRole } from '@/lib/store/role-context';
import { MOCK_SHOPS, MOCK_ITEMS } from '@/lib/mock-data';
import { Shop } from '@/lib/types';

import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { PromoBanner } from '@/components/home/PromoBanner';
import { CategoryBar, CategoryFilter } from '@/components/home/CategoryBar';
import { VendorCard } from '@/components/home/VendorCard';
import { ItemCard } from '@/components/home/ItemCard';
import { StickyCart } from '@/components/cart/StickyCart';
import { LiveTrackingModal } from '@/components/orders/LiveTrackingModal';
import { CampusSelectorModal } from '@/components/modals/CampusSelectorModal';

import { ShopDashboard } from '@/components/dashboard/ShopDashboard';
import { AdminDashboard } from '@/components/dashboard/AdminDashboard';
import { SupportDashboard } from '@/components/dashboard/SupportDashboard';

import { 
  Sparkles, 
  Store, 
  Flame, 
  Clock, 
  ChevronRight,
  SlidersHorizontal,
  X
} from 'lucide-react';

export default function HomePage() {
  const { activeCampus } = useCampus();
  const { currentRole } = useRole();
  const { isCartDrawerOpen, setIsCartDrawerOpen } = useCart();

  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('ALL');
  const [isVegOnly, setIsVegOnly] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [mobileTab, setMobileTab] = useState<'home' | 'orders'>('home');

  // Filter shops by active campus
  const campusShops = MOCK_SHOPS.filter((s) => s.campus_id === activeCampus.id);

  // Filter vendors based on category
  const filteredShops = campusShops.filter((shop) => {
    if (selectedCategory === 'SALON') return shop.service_type === 'SALON_GROOMING';
    if (selectedCategory === 'LAUNDRY') return shop.service_type === 'LAUNDRY';
    if (selectedCategory === 'PRINT') return shop.service_type === 'PRINT_STATIONERY';
    if (selectedCategory === 'NIGHT_MESS') return shop.tags?.includes('Night Mess');
    if (selectedCategory === 'FOOD_MEALS' || selectedCategory === 'SNACKS_DRINKS') {
      return shop.service_type === 'FOOD_DINING';
    }
    return true;
  });

  // Filter menu items
  const activeShopForItems = selectedShop || campusShops[0];
  const shopItems = MOCK_ITEMS.filter((item) => {
    const matchesShop = selectedShop ? item.shop_id === selectedShop.id : true;
    const matchesVeg = isVegOnly ? item.is_veg : true;
    if (selectedCategory === 'SALON') return item.duration_minutes !== undefined;
    return matchesShop && matchesVeg;
  });

  const bestsellers = shopItems.filter((i) => i.bestseller);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F5] pb-24 lg:pb-12 text-[#391713]">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 w-full py-6 flex-1">
        {/* Render role-specific dashboards */}
        {currentRole === 'SHOP_OWNER' || currentRole === 'SHOP_STAFF' ? (
          <ShopDashboard />
        ) : currentRole === 'SUPER_ADMIN' || currentRole === 'CAMPUS_ADMIN' ? (
          <AdminDashboard />
        ) : currentRole === 'QUERY_RESOLVER' ? (
          <SupportDashboard />
        ) : currentRole === 'CONFIG_CHANGER' ? (
          <div className="bg-white border border-[#F1E9E4] rounded-3xl p-6 shadow-sm space-y-4">
            <h2 className="text-xl font-black text-[#391713]">Campus Parameter Configuration</h2>
            <p className="text-xs text-[#7A6A65]">Tweak platform fees, max concurrent kitchen slots, and surge rules</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
              <div className="p-4 bg-[#FAF7F5] rounded-2xl border border-[#F1E9E4]">
                <label className="text-xs font-black text-[#391713] block mb-1">Standard Campus Platform Fee (₹)</label>
                <input type="number" defaultValue={5} className="w-full p-2 bg-white border border-[#F1E9E4] rounded-xl text-sm font-bold" />
              </div>
              <div className="p-4 bg-[#FAF7F5] rounded-2xl border border-[#F1E9E4]">
                <label className="text-xs font-black text-[#391713] block mb-1">Max Concurrent Kitchen Orders (Throttling Cap)</label>
                <input type="number" defaultValue={15} className="w-full p-2 bg-white border border-[#F1E9E4] rounded-xl text-sm font-bold" />
              </div>
            </div>
          </div>
        ) : (
          /* =========================================================================
             CUSTOMER VIEWPORT: CLEAN 3-COLUMN DESKTOP & NATIVE MOBILE FLOW
             ========================================================================= */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left & Middle Column (9 Cols on Desktop, Full Width on Mobile) */}
            <div className="lg:col-span-8 space-y-8">
              {/* Promo Banner (Figma Frame 71) */}
              <PromoBanner />

              {/* Category Filter Pills (Figma Filter component) */}
              <CategoryBar
                selectedCategory={selectedCategory}
                onSelectCategory={(cat) => {
                  setSelectedCategory(cat);
                  setSelectedShop(null);
                }}
                isVegOnly={isVegOnly}
                onToggleVegOnly={() => setIsVegOnly(!isVegOnly)}
              />

              {/* Vendors List in Campus */}
              <div className="space-y-4" id="canteen-section">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-black text-[#391713]">
                      Campus Merchants in {activeCampus.name}
                    </h2>
                    <p className="text-xs text-[#7A6A65]">
                      Select a vendor to browse their full menu or book service slots
                    </p>
                  </div>
                  {selectedShop && (
                    <button
                      onClick={() => setSelectedShop(null)}
                      className="text-xs text-[#E95322] font-black hover:underline"
                    >
                      Show All Vendors
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {filteredShops.map((shop) => (
                    <VendorCard
                      key={shop.id}
                      shop={shop}
                      isSelected={selectedShop?.id === shop.id}
                      onSelect={() => setSelectedShop(shop)}
                    />
                  ))}
                </div>
              </div>

              {/* Bestseller Highlights (Figma 242:1749 / 112:536) */}
              {bestsellers.length > 0 && !selectedShop && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-[#FFF4EF] flex items-center justify-center text-[#E95322]">
                        <Flame className="w-4 h-4 fill-[#E95322]" />
                      </div>
                      <h2 className="text-lg font-black text-[#391713]">Campus Favorites & Bestsellers</h2>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {bestsellers.slice(0, 3).map((item) => (
                      <ItemCard key={item.id} item={item} shop={activeShopForItems} />
                    ))}
                  </div>
                </div>
              )}

              {/* Active Menu Items Grid */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black text-[#391713]">
                      {selectedShop ? `${selectedShop.name} Menu` : 'All Items & Services'}
                    </h2>
                    <p className="text-xs text-[#7A6A65]">
                      {shopItems.length} items available right now
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {shopItems.map((item) => {
                    const shop = campusShops.find((s) => s.id === item.shop_id) || activeShopForItems;
                    return <ItemCard key={item.id} item={item} shop={shop} />;
                  })}
                </div>
              </div>
            </div>

            {/* Desktop Right Column: Sticky Cart & Live Checkout (4 Cols) */}
            <div className="hidden lg:block lg:col-span-4">
              <StickyCart />
            </div>
          </div>
        )}
      </main>

      {/* Modals & Drawers */}
      <CampusSelectorModal />
      <LiveTrackingModal />

      {/* Mobile Cart Drawer (< 1024px) */}
      {isCartDrawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-t-3xl max-h-[85vh] h-full flex flex-col overflow-hidden animate-in slide-in-from-bottom">
            <StickyCart isDrawer={true} />
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (Figma Frame 56) */}
      {currentRole === 'CUSTOMER' && (
        <BottomNav activeTab={mobileTab} setActiveTab={setMobileTab} />
      )}
    </div>
  );
}
