'use client';

// components/dashboard/ShopDashboard.tsx
// Merchant console. Previously every control mutated local state — accepting an
// order did nothing, stock toggles were invisible to customers, and the PIN was
// verified against data held in the browser. It now drives the real API, and the
// server decides what is legal.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/store/session-context';
import { api, errorMessage } from '@/lib/api-client';
import { EmptyState, ErrorBanner, LogoLoader } from '@/components/ui/States';
import type { CatalogItem, Order, Shop } from '@/lib/types';
import {
  AlertCircle,
  BellOff,
  BellRing,
  CheckCircle2,
  KeyRound,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Store,
  UtensilsCrossed,
} from 'lucide-react';

const POLL_MS = 15_000;

function playKitchenChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(784, ctx.currentTime);
    osc.frequency.setValueAtTime(1046, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.45);
  } catch {
    // Audio context may be suspended before initial user interaction
  }
}

export function ShopDashboard() {
  const { user } = useSession();
  const [shop, setShop] = useState<Shop | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);
  const knownOrderIds = useRef<Set<string>>(new Set());
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Delivery economics the checkout actually charges — editable per shop so an
  // owner never has to ask an admin to change a ₹10 delivery fee.
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    deliveryFee: '0',
    minOrder: '',
    prepTimeMinutes: '20',
  });

  // Seed the form from the loaded shop, once per shop, without clobbering user edits.
  const seededShopId = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.shopId) {
      setIsLoading(false);
      return;
    }
    try {
      const [shopData, orderData, menuData] = await Promise.all([
        api.get<{ shop: Shop }>(`/api/v1/shops/${user.shopId}`),
        api.get<{ orders: Order[] }>('/api/v1/shop/orders?includeClosed=true'),
        api.get<{ items: CatalogItem[] }>(`/api/v1/shops/${user.shopId}/menu`),
      ]);
      setShop(shopData.shop);
      setOrders(orderData.orders);
      if (knownOrderIds.current.size > 0 && soundEnabledRef.current) {
        const hasNewOrder = orderData.orders.some(
          (o) => o.status === 'PLACED' && !knownOrderIds.current.has(o.id),
        );
        if (hasNewOrder) {
          playKitchenChime();
        }
      }
      knownOrderIds.current = new Set(orderData.orders.map((o) => o.id));
      setItems(menuData.items);
      if (seededShopId.current !== shopData.shop.id) {
        seededShopId.current = shopData.shop.id;
        setProfileForm({
          deliveryFee: String(shopData.shop.delivery_fee ?? 0),
          minOrder:
            shopData.shop.min_order_for_free_delivery === null ||
            shopData.shop.min_order_for_free_delivery === undefined
              ? ''
              : String(shopData.shop.min_order_for_free_delivery),
          prepTimeMinutes: String(shopData.shop.prep_time_minutes ?? 20),
        });
      }
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let isMounted = true;
    void Promise.resolve().then(async () => {
      if (isMounted) await load();
    });
    return () => {
      isMounted = false;
    };
  }, [load]);

  // Merchants need to see new orders without refreshing.
  useEffect(() => {
    if (!user?.shopId) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [user?.shopId, load]);

  const activeOrders = orders.filter(
    (order) => order.status !== 'DELIVERED' && order.status !== 'CANCELLED',
  );

  const runAction = async (
    orderId: string,
    body: Record<string, unknown>,
    onSuccess?: (order: Order) => void,
  ) => {
    setBusyOrderId(orderId);
    setError(null);
    try {
      const data = await api.post<{ order: Order }>(`/api/v1/shop/orders/${orderId}`, body);
      setOrders((current) => current.map((order) => (order.id === orderId ? data.order : order)));
      onSuccess?.(data.order);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyOrderId(null);
    }
  };

  const setStatus = async (patch: { isOpen?: boolean; snoozeMinutes?: number }) => {
    setError(null);
    try {
      const data = await api.post<{ shop: Shop }>('/api/v1/shop/status', patch);
      setShop(data.shop);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const toggleItem = async (item: CatalogItem) => {
    setError(null);
    try {
      const data = await api.patch<{ item: CatalogItem }>(`/api/v1/shop/items/${item.id}`, {
        isAvailable: !item.is_available,
      });
      setItems((current) => current.map((entry) => (entry.id === item.id ? data.item : entry)));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const saveProfile = async () => {
    setError(null);
    setProfileNotice(null);
    setIsSavingProfile(true);
    try {
      const data = await api.patch<{ shop: Shop }>('/api/v1/shop/profile', {
        deliveryFee: Number(profileForm.deliveryFee),
        minOrderForFreeDelivery: profileForm.minOrder.trim() === '' ? null : Number(profileForm.minOrder),
        prepTimeMinutes: Number(profileForm.prepTimeMinutes),
      });
      setShop(data.shop);
      setProfileNotice('Saved. Checkout now charges these values.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSavingProfile(false);
    }
  };

  if (!user?.shopId) {
    return (
      <EmptyState
        icon={<Store className="w-8 h-8" />}
        title="No merchant linked to this account"
        description="This account is not associated with a shop yet. Ask a platform admin to link it."
      />
    );
  }

  if (isLoading) return <LogoLoader label="Loading your merchant console…" />;

  return (
    <div className="space-y-8">
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      <div className="bg-white border border-[#F2ECE9] rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FFECEB] flex items-center justify-center">
              <Store className="w-7 h-7 text-[#FF6161]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-[#1E1E24]">
                  {shop?.name ?? 'Merchant'}
                </h1>
                {shop?.delivery_enabled ? (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                    Self-Delivery
                  </span>
                ) : (
                  <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                    Appointment Only
                  </span>
                )}
              </div>
              <p className="text-xs text-[#7E7E8B] mt-0.5">
                Live order queue &amp; stock control
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {shop?.is_open && !shop.is_snoozed ? (
              <>
                <span className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-300 px-4 py-2.5 rounded-2xl text-xs font-black">
                  <PlayCircle className="w-4 h-4 text-emerald-700" />
                  Accepting Orders
                </span>
                <button
                  type="button"
                  onClick={() => void setStatus({ snoozeMinutes: 30 })}
                  className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-4 py-2.5 rounded-2xl text-xs font-black transition"
                >
                  <PauseCircle className="w-4 h-4 text-amber-700" />
                  Snooze 30 min
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void setStatus({ isOpen: true })}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-2xl text-xs font-black transition"
              >
                <PlayCircle className="w-4 h-4" />
                Open &amp; Start Accepting
              </button>
            )}
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-[#1E1E24]">Live Kitchen &amp; Delivery Queue</h2>
            <span className="bg-[#FF6161] text-white text-xs font-black px-2.5 py-0.5 rounded-full">
              {activeOrders.length} Active
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                setSoundEnabled((val) => {
                  const next = !val;
                  if (next) playKitchenChime();
                  return next;
                });
              }}
              className={`flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl border transition ${
                soundEnabled
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
              }`}
              title={soundEnabled ? 'Kitchen order audio alert ON (click to mute)' : 'Audio alerts muted (click to unmute)'}
            >
              {soundEnabled ? (
                <BellRing className="w-3.5 h-3.5 text-amber-700" />
              ) : (
                <BellOff className="w-3.5 h-3.5 text-stone-400" />
              )}
              <span className="hidden xs:inline">{soundEnabled ? 'Alerts ON' : 'Alerts OFF'}</span>
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="flex items-center gap-1.5 text-xs font-bold text-[#1E1E24] bg-white border border-[#F2ECE9] hover:bg-[#FAF6F4] px-3 py-1.5 rounded-xl transition"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#FF6161]" />
              Refresh
            </button>
          </div>
        </div>

        {activeOrders.length === 0 ? (
          <EmptyState
            icon={<UtensilsCrossed className="w-8 h-8" />}
            title="No pending orders right now"
            description="New orders appear here automatically as students place them."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeOrders.map((order) => {
              const isBusy = busyOrderId === order.id;
              return (
                <article
                  key={order.id}
                  className="bg-white border border-[#F2ECE9] rounded-3xl p-5 shadow-sm space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-black text-[#FF6161]">
                        {order.order_number}
                      </span>
                      <h3 className="font-black text-sm text-[#1E1E24] truncate">
                        {order.customer_name}
                      </h3>
                      <p className="text-xs text-[#7E7E8B] mt-0.5">{order.address_summary}</p>
                      {order.special_instructions ? (
                        <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-1.5">
                          Note: {order.special_instructions}
                        </p>
                      ) : null}
                    </div>
                    <span className="bg-[#FFF5F4] text-[#FF6161] border border-[#FF6161]/20 text-[10px] font-black px-2.5 py-1 rounded-full uppercase shrink-0">
                      {order.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="bg-[#FAF6F4] rounded-2xl p-3 space-y-1 text-xs">
                    {order.items?.map((item) => (
                      <div key={item.id} className="flex justify-between font-semibold text-[#1E1E24]">
                        <span>
                          {item.quantity}× {item.item_name}
                        </span>
                        <span className="font-black text-[#FF6161]">₹{item.total_price}</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-[#F2ECE9] flex justify-between font-black">
                      <span>Total ({order.payment?.payment_method?.replace(/_/g, ' ')})</span>
                      <span>₹{order.total_amount}</span>
                    </div>
                  </div>

                  {rejectingId === order.id ? (
                    <div className="space-y-2">
                      <label
                        htmlFor={`reject-${order.id}`}
                        className="text-[11px] font-black uppercase tracking-wider text-[#1E1E24]"
                      >
                        Reason for rejecting
                      </label>
                      <textarea
                        id={`reject-${order.id}`}
                        rows={2}
                        maxLength={300}
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                        className="w-full p-2.5 rounded-xl bg-white border border-[#F2ECE9] text-xs font-medium focus:outline-none focus:border-[#FF6161]"
                        placeholder="e.g. Kitchen closed early tonight"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={isBusy || rejectReason.trim().length < 3}
                          onClick={() =>
                            void runAction(order.id, {
                              action: 'reject',
                              reason: rejectReason.trim(),
                            }).then(() => {
                              setRejectingId(null);
                              setRejectReason('');
                            })
                          }
                          className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-black"
                        >
                          {isBusy ? 'Rejecting…' : 'Confirm Rejection'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectingId(null)}
                          className="px-3 py-2 rounded-xl text-xs font-bold border border-[#F2ECE9] bg-white"
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {order.status === 'PLACED' ? (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void runAction(order.id, { action: 'accept' })}
                            className="flex-1 bg-[#FF6161] hover:bg-[#EE4D4D] disabled:opacity-50 text-white py-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-2"
                          >
                            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                            Accept Order
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectingId(order.id)}
                            className="px-3 py-2 rounded-xl text-xs font-bold text-rose-600 border border-rose-200 hover:bg-rose-50 transition"
                          >
                            Reject
                          </button>
                        </>
                      ) : null}

                      {order.status === 'ACCEPTED' ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void runAction(order.id, { action: 'status', toStatus: 'PREPARING' })
                          }
                          className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-black transition"
                        >
                          Start Preparing
                        </button>
                      ) : null}

                      {order.status === 'PREPARING' ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void runAction(order.id, {
                              action: 'status',
                              toStatus: 'OUT_FOR_DELIVERY',
                            })
                          }
                          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-black transition"
                        >
                          Send Staff to Gate
                        </button>
                      ) : null}
                    </div>
                  )}

                  {order.status === 'OUT_FOR_DELIVERY' && rejectingId !== order.id ? (
                    <div className="pt-3 border-t border-[#F2ECE9] space-y-2">
                      <label
                        htmlFor={`pin-${order.id}`}
                        className="text-[11px] font-black text-[#1E1E24] uppercase tracking-wider flex items-center gap-1.5"
                      >
                        <KeyRound className="w-3.5 h-3.5 text-[#FF6161]" /> Student Delivery PIN
                      </label>
                      <div className="flex gap-2">
                        <input
                          id={`pin-${order.id}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="4-digit"
                          value={pinInputs[order.id] ?? ''}
                          onChange={(event) =>
                            setPinInputs((current) => ({
                              ...current,
                              [order.id]: event.target.value.replace(/\D/g, ''),
                            }))
                          }
                          className="w-28 text-center text-sm font-mono font-black p-2 bg-[#FAF6F4] border border-[#F2ECE9] rounded-xl focus:outline-none focus:border-[#FF6161]"
                        />
                        <button
                          type="button"
                          disabled={isBusy || (pinInputs[order.id] ?? '').length !== 4}
                          onClick={() =>
                            void runAction(order.id, {
                              action: 'verify-pin',
                              pin: pinInputs[order.id],
                            }).then(() => {
                              setPinInputs((current) => {
                                const next = { ...current };
                                delete next[order.id];
                                return next;
                              });
                            })
                          }
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs px-3 py-2 rounded-xl transition flex items-center justify-center gap-2"
                        >
                          {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Verify &amp; Complete
                        </button>
                      </div>
                      <p className="text-[10px] text-[#7E7E8B] flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Ask the student for their code. After 5 wrong attempts the order is locked
                        for support review.
                      </p>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-white border border-[#F2ECE9] rounded-3xl p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-black text-[#1E1E24]">Delivery &amp; Kitchen Settings</h2>
          <p className="text-xs text-[#7E7E8B]">
            These are the exact values the checkout charges students — changes apply immediately.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label htmlFor="shop-delivery-fee" className="text-[11px] font-black uppercase tracking-wider text-[#7E7E8B]">
              Delivery fee (₹)
            </label>
            <input
              id="shop-delivery-fee"
              type="number"
              min={0}
              max={500}
              inputMode="decimal"
              value={profileForm.deliveryFee}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, deliveryFee: event.target.value }))
              }
              className="w-full p-2.5 rounded-xl bg-[#FAF6F4] border border-[#F2ECE9] text-sm font-bold focus:outline-none focus:border-[#FF6161]"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="shop-min-order" className="text-[11px] font-black uppercase tracking-wider text-[#7E7E8B]">
              Free delivery above (₹, blank = off)
            </label>
            <input
              id="shop-min-order"
              type="number"
              min={0}
              max={5000}
              inputMode="decimal"
              value={profileForm.minOrder}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, minOrder: event.target.value }))
              }
              placeholder="Not set"
              className="w-full p-2.5 rounded-xl bg-[#FAF6F4] border border-[#F2ECE9] text-sm font-bold focus:outline-none focus:border-[#FF6161]"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="shop-prep-time" className="text-[11px] font-black uppercase tracking-wider text-[#7E7E8B]">
              Prep time (min)
            </label>
            <input
              id="shop-prep-time"
              type="number"
              min={1}
              max={240}
              inputMode="numeric"
              value={profileForm.prepTimeMinutes}
              onChange={(event) =>
                setProfileForm((current) => ({ ...current, prepTimeMinutes: event.target.value }))
              }
              className="w-full p-2.5 rounded-xl bg-[#FAF6F4] border border-[#F2ECE9] text-sm font-bold focus:outline-none focus:border-[#FF6161]"
            />
          </div>
        </div>

        {profileNotice ? (
          <p className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            {profileNotice}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void saveProfile()}
          disabled={isSavingProfile}
          className="bg-[#FF6161] hover:bg-[#EE4D4D] disabled:opacity-50 text-white font-black text-xs px-5 py-2.5 rounded-xl transition flex items-center gap-2"
        >
          {isSavingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Save settings
        </button>
      </section>

      <section className="bg-white border border-[#F2ECE9] rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[#1E1E24]">Live Menu &amp; Stock</h2>
            <p className="text-xs text-[#7E7E8B]">
              Turning an item off hides it from students immediately
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="p-3 rounded-2xl border border-[#F2ECE9] flex items-center justify-between gap-3 bg-[#FAF6F4]"
            >
              <div className="min-w-0">
                <h4 className="font-bold text-xs text-[#1E1E24] truncate">{item.name}</h4>
                <span className="text-xs font-black text-[#FF6161]">₹{item.discounted_price ?? item.price}</span>
              </div>
              <button
                type="button"
                onClick={() => void toggleItem(item)}
                aria-pressed={item.is_available}
                className={`px-3 py-1 rounded-xl text-xs font-black transition shrink-0 ${
                  item.is_available
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                }`}
              >
                {item.is_available ? 'In Stock' : 'Sold Out'}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
