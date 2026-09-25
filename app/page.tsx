'use client';

import React, { useMemo, useState } from 'react';
import { useCampus } from '@/lib/store/campus-context';
import { useCart } from '@/lib/store/cart-context';
import { useSession } from '@/lib/store/session-context';
import { useUi } from '@/lib/store/ui-context';
import { useCatalog } from '@/lib/hooks/use-catalog';
import { PLATFORM_CONFIG } from '@/lib/server/config';
import type { Shop } from '@/lib/types';

import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { PromoBanner } from '@/components/home/PromoBanner';
import { CategoryBar, type CategoryFilter } from '@/components/home/CategoryBar';
import { VendorCard } from '@/components/home/VendorCard';
import { ItemCard } from '@/components/home/ItemCard';
import { StickyCart } from '@/components/cart/StickyCart';
import { LiveTrackingModal } from '@/components/orders/LiveTrackingModal';
import { CampusSelectorModal } from '@/components/modals/CampusSelectorModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LogoLoader, EmptyState, ErrorBanner } from '@/components/ui/States';

import { ShopDashboard } from '@/components/dashboard/ShopDashboard';
import { AdminDashboard } from '@/components/dashboard/AdminDashboard';
import { SupportDashboard } from '@/components/dashboard/SupportDashboard';

import { AlertCircle, Flame, PackageSearch, Search, Store } from 'lucide-react';

/** Which service types a category pill includes. */
const CATEGORY_SERVICE_MAP: Record<CategoryFilter, string[] | null> = {
  ALL: null,
  FOOD_MEALS: ['FOOD_DINING'],
  NIGHT_MESS: ['FOOD_DINING'],
  SNACKS_DRINKS: ['FOOD_DINING'],
  SALON: ['SALON_GROOMING'],
  LAUNDRY: ['LAUNDRY'],
  PRINT: ['PRINT_STATIONERY'],
};

export default function HomePage() {
  const { activeCampus, isLoading: isCampusLoading } = useCampus();
  const { currentRole } = useSession();
  const {
    isCartDrawerOpen,
    setIsCartDrawerOpen,
    pendingConflict,
    confirmReplaceCart,
    cancelReplaceCart,
  } = useCart();
  const { searchQuery } = useUi();

  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('ALL');
  const [isVegOnly, setIsVegOnly] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);

  const { shops, items, isLoading, error, reload } = useCatalog(activeCampus?.id ?? null);

  const isStaff = currentRole !== 'CUSTOMER';

  // Course-correct a selection that no longer exists after a campus change.
  const activeShop =
    selectedShop && shops.some((shop) => shop.id === selectedShop.id) ? selectedShop : null;

  /**
   * Shops matching the active category pill.
   * The previous version filtered items with a separate rule that ignored the
   * shop, which leaked every merchant's items into a filtered view. Filtering
   * now always flows shop -> item.
   */
  const filteredShops = useMemo(() => {
    const serviceTypes = CATEGORY_SERVICE_MAP[selectedCategory];

    return shops.filter((shop) => {
      if (serviceTypes && !serviceTypes.includes(shop.service_type)) return false;
      if (selectedCategory === 'NIGHT_MESS') return shop.tags?.includes('Night Mess') ?? false;
      return true;
    });
  }, [shops, selectedCategory]);

  const visibleShopIds = useMemo(() => new Set(filteredShops.map((shop) => shop.id)), [filteredShops]);

  const shopItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return items.filter((item) => {
      const shop = shops.find((entry) => entry.id === item.shop_id);
      if (!shop) return false;
      if (!visibleShopIds.has(item.shop_id)) return false;
      if (activeShop && item.shop_id !== activeShop.id) return false;
      if (isVegOnly && !item.is_veg) return false;

      if (query) {
        const haystack = `${item.name} ${item.description} ${shop.name}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [items, shops, visibleShopIds, activeShop, isVegOnly, searchQuery]);

  const bestsellers = useMemo(() => shopItems.filter((item) => item.bestseller), [shopItems]);

  const renderCustomerView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <div className="lg:col-span-8 space-y-8">
        <PromoBanner />

        <CategoryBar
          selectedCategory={selectedCategory}
          onSelectCategory={(category) => {
            setSelectedCategory(category);
            setSelectedShop(null);
          }}
          isVegOnly={isVegOnly}
          onToggleVegOnly={() => setIsVegOnly((value) => !value)}
        />

        {error ? <ErrorBanner message={error} onRetry={() => void reload()} /> : null}

        {isCampusLoading || isLoading ? (
          <LogoLoader label="Loading campus merchants…" />
        ) : shops.length === 0 ? (
          <EmptyState
            icon={<Store className="w-8 h-8" />}
            title="No merchants on this campus yet"
            description="We are onboarding canteens and services for this campus. Try switching campus in the meantime."
          />
        ) : (
          <>
            <section className="space-y-4" id="canteen-section" aria-labelledby="vendors-heading">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 id="vendors-heading" className="text-xl font-black text-[#1E1E24]">
                    Campus Merchants in {activeCampus?.name}
                  </h2>
                  <p className="text-xs text-[#7E7E8B]">
                    Select a vendor to browse their full menu or book service slots
                  </p>
                </div>
                {activeShop ? (
                  <button
                    type="button"
                    onClick={() => setSelectedShop(null)}
                    className="text-xs text-[#FF6161] font-black hover:underline shrink-0"
                  >
                    Show All Vendors
                  </button>
                ) : null}
              </div>

              {filteredShops.length === 0 ? (
                <EmptyState
                  icon={<Search className="w-8 h-8" />}
                  title="No merchants match this filter"
                  description="Try a different category or clear your search."
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {filteredShops.map((shop) => (
                    <VendorCard
                      key={shop.id}
                      shop={shop}
                      isSelected={activeShop?.id === shop.id}
                      onSelect={() => setSelectedShop(shop)}
                    />
                  ))}
                </div>
              )}
            </section>

            {bestsellers.length > 0 && !activeShop ? (
              <section className="space-y-4 pt-2" aria-labelledby="bestsellers-heading">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#FFF5F4] flex items-center justify-center text-[#FF6161]">
                    <Flame className="w-4 h-4 fill-[#FF6161]" />
                  </div>
                  <h2 id="bestsellers-heading" className="text-lg font-black text-[#1E1E24]">
                    Campus Favorites &amp; Bestsellers
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {bestsellers.slice(0, 3).map((item) => {
                    const shop = shops.find((entry) => entry.id === item.shop_id);
                    if (!shop) return null;
                    return <ItemCard key={item.id} item={item} shop={shop} />;
                  })}
                </div>
              </section>
            ) : null}

            <section className="space-y-4 pt-2" aria-labelledby="items-heading">
              <div>
                <h2 id="items-heading" className="text-lg font-black text-[#1E1E24]">
                  {activeShop ? `${activeShop.name} Menu` : 'All Items & Services'}
                </h2>
                <p className="text-xs text-[#7E7E8B]">
                  {shopItems.length} {shopItems.length === 1 ? 'item' : 'items'} available right now
                </p>
              </div>

              {shopItems.length === 0 ? (
                <EmptyState
                  icon={<PackageSearch className="w-8 h-8" />}
                  title="Nothing matches that search"
                  description="Try another dish, or clear the filters to see everything nearby."
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {shopItems.map((item) => {
                    const shop = shops.find((entry) => entry.id === item.shop_id);
                    if (!shop) return null;
                    return <ItemCard key={item.id} item={item} shop={shop} />;
                  })}
                </div>
              )}
            </section>

            <footer className="pt-8 pb-12 text-center border-t border-[#F2ECE9] space-y-1.5 text-[#7E7E8B]">
              <p className="text-xs font-bold text-[#1E1E24]">Go-Bite Campus Concierge</p>
              <p className="text-[11px] max-w-md mx-auto leading-relaxed">
                Hyperlocal campus courier and ordering service connecting residents with independent campus vendors.
                Food quality, hygiene, and statutory FSSAI compliance remain the sole responsibility of the respective merchants.
              </p>
              <p className="text-[10px] text-[#A0A0AB]">
                © {new Date().getFullYear()} Go-Bite Logistics. All prices in INR (₹).
              </p>
            </footer>
          </>
        )}
      </div>

      <div className="hidden lg:block lg:col-span-4">
        <StickyCart />
      </div>
    </div>
  );

  const renderConfigView = () => (
    <div className="bg-white border border-[#F2ECE9] rounded-3xl p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-black text-[#1E1E24]">Platform Parameters</h2>
          <p className="text-xs text-[#7E7E8B]">
            Read-only in this release — editing requires the <code>platform_config</code> table
            and an audited write endpoint.
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        {[
          ['Campus platform fee', `₹${PLATFORM_CONFIG.platformFeeRupees}`],
          ['Cash-on-delivery cap', `₹${PLATFORM_CONFIG.codMaxRupees}`],
          ['Max live orders per customer', String(PLATFORM_CONFIG.maxActiveOrdersPerCustomer)],
          ['Max live orders per merchant', String(PLATFORM_CONFIG.maxActiveOrdersPerShop)],
        ].map(([label, value]) => (
          <div key={label} className="p-4 bg-[#FAF6F4] rounded-2xl border border-[#F2ECE9]">
            <dt className="text-[11px] font-black text-[#7E7E8B] uppercase tracking-wider">
              {label}
            </dt>
            <dd className="text-lg font-black text-[#1E1E24] mt-1">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF6F4] pb-24 lg:pb-12 text-[#1E1E24]">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 w-full py-6 flex-1">
        {currentRole === 'SHOP_OWNER' || currentRole === 'SHOP_STAFF' ? (
          <ShopDashboard />
        ) : currentRole === 'SUPER_ADMIN' || currentRole === 'CAMPUS_ADMIN' ? (
          <AdminDashboard />
        ) : currentRole === 'QUERY_RESOLVER' ? (
          <SupportDashboard />
        ) : currentRole === 'CONFIG_CHANGER' ? (
          renderConfigView()
        ) : (
          renderCustomerView()
        )}
      </main>

      <CampusSelectorModal />
      <LiveTrackingModal />

      <ConfirmDialog
        isOpen={pendingConflict !== null}
        title="Replace your cart?"
        message={
          pendingConflict
            ? `Your cart has items from another merchant. Replace it to order from ${pendingConflict.shop.name}?`
            : ''
        }
        confirmLabel="Replace cart"
        isDestructive
        isBusy={isReplacing}
        onConfirm={() => {
          setIsReplacing(true);
          void confirmReplaceCart().finally(() => setIsReplacing(false));
        }}
        onCancel={cancelReplaceCart}
      />

      {isCartDrawerOpen && !isStaff ? (
        <div
          onClick={() => setIsCartDrawerOpen(false)}
          className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden bg-black/60 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden"
          >
            <StickyCart isDrawer />
          </div>
        </div>
      ) : null}

      {!isStaff ? <BottomNav /> : null}
    </div>
  );
}
