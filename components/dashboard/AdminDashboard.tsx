'use client';

// components/dashboard/AdminDashboard.tsx
// Admin console. The previous version displayed fabricated revenue figures and
// a "Save & Issue Login" button that only fired an alert. It now reports what is
// actually known (real merchants from the API) and is explicit about what this
// release does not yet provide.

import React, { useCallback, useEffect, useState } from 'react';
import { useCampus } from '@/lib/store/campus-context';
import { api, errorMessage } from '@/lib/api-client';
import { EmptyState, ErrorBanner, LogoLoader } from '@/components/ui/States';
import type { Order, Shop } from '@/lib/types';
import {
  AlertTriangle,
  Bike,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Store,
} from 'lucide-react';

/** COD settlement row for one merchant. */
interface DuesRow {
  shopId: string;
  shopName: string;
  deliveredOrders: number;
  codCollected: number;
  platformFeesOwed: number;
  grossVolume: number;
  refundedOrders?: number;
  refundedAmount?: number;
}

interface DuesTotals {
  deliveredOrders: number;
  codCollected: number;
  platformFeesOwed: number;
  grossVolume: number;
  refundedOrders?: number;
  refundedAmount?: number;
}

export function AdminDashboard() {
  const { allCampuses, activeCampus, setActiveCampus } = useCampus();
  const [shops, setShops] = useState<Shop[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [dues, setDues] = useState<DuesRow[]>([]);
  const [duesTotals, setDuesTotals] = useState<DuesTotals | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeCampus) return;
    setIsLoading(true);
    try {
      const [shopData, orderData, duesData] = await Promise.all([
        api.get<{ shops: Shop[] }>(`/api/v1/campuses/${activeCampus.id}/shops`),
        // Campus-scoped admin read: the customer-scoped GET /orders showed
        // admins nothing, which made this whole console cosmetic.
        api.get<{ orders: Order[] }>(`/api/v1/admin/orders?campusId=${activeCampus.id}`),
        api.get<{ dues: DuesRow[]; totals: DuesTotals }>(
          `/api/v1/admin/dues?campusId=${activeCampus.id}`,
        ),
      ]);
      setShops(shopData.shops);
      setOrders(orderData.orders);
      setDues(duesData.dues);
      setDuesTotals(duesData.totals);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [activeCampus]);

  useEffect(() => {
    let isMounted = true;
    void Promise.resolve().then(async () => {
      if (isMounted) await load();
    });
    return () => {
      isMounted = false;
    };
  }, [load]);

  const liveOrders = orders.filter(
    (order) => order.status !== 'DELIVERED' && order.status !== 'CANCELLED',
  );
  const disputes = orders.filter((order) => order.status === 'DISPUTED');
  const commissionEstimate = orders
    .filter((order) => order.status === 'DELIVERED')
    .reduce((sum, order) => sum + order.total_amount, 0);

  return (
    <div className="space-y-8">
      <div className="bg-white border border-[#F2ECE9] rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-purple-700" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-[#1E1E24]">
                  Campus Control Portal
                </h1>
                <span className="bg-purple-100 text-purple-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                  {allCampuses.length} campuses live
                </span>
              </div>
              <p className="text-xs text-[#7E7E8B] mt-0.5">
                Merchant overview and live order visibility for the selected campus
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-[#FAF6F4] border border-[#F2ECE9] p-1.5 rounded-2xl">
              <MapPin className="w-4 h-4 text-[#FF6161] ml-2" />
              <label htmlFor="admin-campus" className="sr-only">
                Active campus
              </label>
              <select
                id="admin-campus"
                value={activeCampus?.id ?? ''}
                onChange={(event) => {
                  const found = allCampuses.find((campus) => campus.id === event.target.value);
                  if (found) void setActiveCampus(found);
                }}
                className="bg-transparent font-bold text-xs text-[#1E1E24] focus:outline-none pr-3 py-1 cursor-pointer"
              >
                {allCampuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name} ({campus.code})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="p-2.5 rounded-2xl bg-white border border-[#F2ECE9] hover:bg-[#FAF6F4] transition"
              aria-label="Refresh dashboard"
            >
              <RefreshCw className="w-4 h-4 text-[#FF6161]" />
            </button>
          </div>
        </div>
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#F2ECE9] rounded-3xl p-5 shadow-sm">
          <div className="text-[10px] font-bold text-[#7E7E8B] uppercase tracking-wider">
            Campus Merchants
          </div>
          <div className="text-2xl font-black text-[#FF6161]">{shops.length}</div>
          <div className="text-[11px] text-[#7E7E8B]">Food, salon, laundry &amp; print</div>
        </div>

        <div className="bg-white border border-[#F2ECE9] rounded-3xl p-5 shadow-sm">
          <div className="text-[10px] font-bold text-[#7E7E8B] uppercase tracking-wider">
            Live Orders
          </div>
          <div className="text-2xl font-black text-[#1E1E24]">{liveOrders.length}</div>
          <div className="text-[11px] text-[#7E7E8B]">In progress right now</div>
        </div>

        <div className="bg-white border border-[#F2ECE9] rounded-3xl p-5 shadow-sm">
          <div className="text-[10px] font-bold text-[#7E7E8B] uppercase tracking-wider">
            Open Disputes
          </div>
          <div className={`text-2xl font-black ${disputes.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {disputes.length}
          </div>
          <div className="text-[11px] text-[#7E7E8B]">Awaiting support resolution</div>
        </div>

        <div className="bg-white border border-[#F2ECE9] rounded-3xl p-5 shadow-sm">
          <div className="text-[10px] font-bold text-[#7E7E8B] uppercase tracking-wider">
            Delivered Value
          </div>
          <div className="text-2xl font-black text-[#1E1E24]">₹{commissionEstimate.toFixed(0)}</div>
          <div className="text-[11px] text-[#7E7E8B]">Completed orders on this campus</div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900">
          <p className="font-black">Vendor onboarding is not enabled in this release.</p>
          <p className="mt-0.5">
            Creating merchants and issuing staff logins requires a dedicated audited endpoint plus
            a merchant invite flow. Until that ships, merchants are provisioned directly in the
            database — deliberately, so no UI can mint privileged accounts.
          </p>
        </div>
      </div>

      <section className="bg-white border border-[#F2ECE9] rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[#1E1E24]">Cash-on-Delivery Settlement</h2>
            <p className="text-xs text-[#7E7E8B]">
              Cash collected at the counter and the platform fee each merchant owes. Delivered
              orders only — reconciled against the same records the ledger uses.
            </p>
          </div>
          {duesTotals ? (
            <div className="flex gap-4 shrink-0">
              <div>
                <div className="text-[10px] font-bold text-[#7E7E8B] uppercase tracking-wider">
                  Cash collected
                </div>
                <div className="text-lg font-black text-[#1E1E24]">
                  ₹{duesTotals.codCollected.toFixed(0)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#7E7E8B] uppercase tracking-wider">
                  Fees owed
                </div>
                <div className="text-lg font-black text-[#FF6161]">
                  ₹{duesTotals.platformFeesOwed.toFixed(0)}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {dues.length === 0 ? (
          <p className="text-xs text-[#7E7E8B] bg-[#FAF6F4] border border-[#F2ECE9] rounded-2xl p-4">
            No cash-on-delivery orders have completed on this campus yet.
          </p>
        ) : (
          <div className="divide-y divide-[#F2ECE9]">
            {dues.map((row) => (
              <div key={row.shopId} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h4 className="font-black text-sm text-[#1E1E24] truncate">{row.shopName}</h4>
                  <p className="text-[11px] text-[#7E7E8B]">
                    {row.deliveredOrders} delivered COD order{row.deliveredOrders === 1 ? '' : 's'} •{' '}
                    ₹{row.codCollected.toFixed(0)} collected
                    {row.refundedOrders && row.refundedOrders > 0 ? (
                      <span className="text-amber-600 font-semibold">
                        {' '}• {row.refundedOrders} refunded (₹{row.refundedAmount?.toFixed(0)})
                      </span>
                    ) : null}
                  </p>
                </div>
                <span className="text-sm font-black text-[#FF6161] shrink-0">
                  owes ₹{row.platformFeesOwed.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white border border-[#F2ECE9] rounded-3xl p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-black text-[#1E1E24]">
            Merchants in {activeCampus?.name ?? 'this campus'}
          </h2>
          <p className="text-xs text-[#7E7E8B]">Live data from the catalogue service</p>
        </div>

        {isLoading ? (
          <LogoLoader label="Loading merchants…" />
        ) : shops.length === 0 ? (
          <EmptyState
            icon={<Store className="w-8 h-8" />}
            title="No merchants on this campus yet"
            description="Onboard merchants directly in the database for now."
          />
        ) : (
          <div className="divide-y divide-[#F2ECE9]">
            {shops.map((shop) => (
              <div key={shop.id} className="py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    aria-hidden
                    className="w-12 h-12 rounded-xl bg-cover bg-center shrink-0 border border-[#F2ECE9]"
                    style={{ backgroundImage: `url(${shop.image_url})` }}
                  />
                  <div className="min-w-0">
                    <h4 className="font-black text-sm text-[#1E1E24] truncate">{shop.name}</h4>
                    <div className="flex items-center gap-2 text-xs text-[#7E7E8B]">
                      <span className="font-semibold">{shop.phone}</span>
                      <span>•</span>
                      <span className="text-[#FF6161] font-bold flex items-center gap-1">
                        <Bike className="w-3 h-3" />
                        {shop.delivery_enabled ? `₹${shop.delivery_fee}` : 'Appointment only'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="bg-[#FAF6F4] border border-[#F2ECE9] text-[#1E1E24] text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">
                    {shop.service_type.replace(/_/g, ' ')}
                  </span>
                  <span
                    className={`text-xs font-black px-2.5 py-1 rounded-full ${
                      shop.is_open && !shop.is_snoozed
                        ? 'text-emerald-700 bg-emerald-50'
                        : 'text-rose-700 bg-rose-50'
                    }`}
                  >
                    {shop.is_open && !shop.is_snoozed ? 'Open' : 'Closed'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
