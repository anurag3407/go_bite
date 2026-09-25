'use client';

// components/cart/StickyCart.tsx
// Checkout. Every number shown comes from the server's re-priced bill; the
// client never calculates a total. Drop-off point and room are required and are
// re-validated server-side, and unsupported payment methods are explained rather
// than silently accepted.

import React, { useEffect, useState } from 'react';
import { useCart } from '@/lib/store/cart-context';
import { useCampus } from '@/lib/store/campus-context';
import { useSession } from '@/lib/store/session-context';
import { api, errorMessage } from '@/lib/api-client';
import type { CampusLocation, PaymentMethod } from '@/lib/types';
import { ErrorBanner, LogoLoader } from '@/components/ui/States';
import {
  AlertCircle,
  ArrowRight,
  Bike,
  CreditCard,
  Loader2,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';

interface StickyCartProps {
  isDrawer?: boolean;
}

export function StickyCart({ isDrawer = false }: StickyCartProps) {
  const { activeCampus } = useCampus();
  const { user, openAuthModal } = useSession();
  const {
    cart,
    isLoadingCart,
    cartError,
    updateQuantity,
    removeItem,
    clearCart,
    issues,
    isPlacing,
    placeOrder,
    selectedLocationId,
    setSelectedLocationId,
    roomOrFlat,
    setRoomOrFlat,
    specialInstructions,
    setSpecialInstructions,
    setIsCartDrawerOpen,
  } = useCart();

  const [locations, setLocations] = useState<CampusLocation[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH_ON_DELIVERY');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCampus) return;
    const controller = new AbortController();
    let isSubscribed = true;

    void Promise.resolve().then(async () => {
      if (!isSubscribed) return;
      setIsLoadingLocations(true);
      try {
        const data = await api.get<{ locations: CampusLocation[] }>(
          `/api/v1/campuses/${activeCampus.id}/locations`,
          { signal: controller.signal },
        );
        if (!isSubscribed) return;
        setLocations(data.locations);
        setSelectedLocationId((current) =>
          current && data.locations.some((location) => location.id === current)
            ? current
            : (data.locations[0]?.id ?? null),
        );
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (isSubscribed) setCheckoutError(errorMessage(error));
      } finally {
        if (isSubscribed) setIsLoadingLocations(false);
      }
    });

    return () => {
      isSubscribed = false;
      controller.abort();
    };
  }, [activeCampus, setSelectedLocationId]);

  const handleCheckout = async () => {
    setCheckoutError(null);
    if (!user) {
      openAuthModal('Sign in to place your order.');
      return;
    }
    if (!selectedLocationId) {
      setCheckoutError('Choose a drop-off point for your order.');
      return;
    }
    if (!roomOrFlat.trim()) {
      setCheckoutError('Enter your room number so staff can find you.');
      return;
    }

    try {
      await placeOrder(paymentMethod);
    } catch (error) {
      setCheckoutError(errorMessage(error));
    }
  };

  if (isLoadingCart && !cart) {
    return <LogoLoader label="Loading your cart…" />;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div
        className={`bg-white border border-[#F2ECE9] rounded-3xl p-6 text-center ${
          isDrawer ? 'h-full flex flex-col justify-center' : ''
        }`}
      >
        <div className="w-16 h-16 rounded-full bg-[#FAF6F4] flex items-center justify-center mx-auto mb-3 text-[#7E7E8B]">
          <ShoppingBag className="w-8 h-8 text-[#7E7E8B]/50" />
        </div>
        <h3 className="font-black text-base text-[#1E1E24]">Your Campus Cart is Empty</h3>
        <p className="text-xs text-[#7E7E8B] mt-1 max-w-xs mx-auto">
          Add meals, midnight snacks, or book grooming and laundry services from your campus
          vendors.
        </p>
        {cartError ? (
          <p className="text-[11px] font-bold text-amber-700 mt-3">{cartError}</p>
        ) : null}
      </div>
    );
  }

  const { pricing, shop } = cart;
  const selectedLocation = locations.find((location) => location.id === selectedLocationId);
  const blockingIssues = issues.filter((issue) => issue.code !== 'CART_EMPTY');

  return (
    <div
      className={`bg-white border border-[#F2ECE9] rounded-3xl overflow-hidden flex flex-col shadow-sm ${
        isDrawer ? 'h-full' : 'sticky top-24 max-h-[calc(100vh-120px)]'
      }`}
    >
      <div className="p-4 border-b border-[#F2ECE9] flex items-center justify-between bg-[#FAF6F4]">
        <div className="min-w-0">
          <div className="text-[10px] text-[#7E7E8B] font-bold uppercase tracking-wider">
            Ordering From
          </div>
          <h3 className="font-black text-sm text-[#1E1E24] truncate">{cart.shopName}</h3>
          <p className="text-[10px] text-[#7E7E8B]">
            {shop.is_open && !shop.is_snoozed ? (
              <span className="text-emerald-700 font-bold">Accepting orders</span>
            ) : (
              <span className="text-rose-700 font-bold">Closed right now</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void clearCart()}
            className="text-xs text-[#7E7E8B] hover:text-rose-600 font-bold transition flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
          {isDrawer ? (
            <button
              type="button"
              onClick={() => setIsCartDrawerOpen(false)}
              aria-label="Close cart"
              className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-[#7E7E8B] hover:text-[#1E1E24]"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="p-4 space-y-3 overflow-y-auto flex-1 divide-y divide-[#F2ECE9]">
        {cart.items.map(({ item, quantity, total_price }) => {
          const isUnavailable = cart.unavailableItemIds.includes(item.id);
          return (
            <div key={item.id} className="pt-3 first:pt-0 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={`w-2.5 h-2.5 rounded-xs border flex items-center justify-center ${
                      item.is_veg ? 'border-emerald-600' : 'border-rose-600'
                    }`}
                  >
                    <span
                      className={`w-1 h-1 rounded-full ${item.is_veg ? 'bg-emerald-600' : 'bg-rose-600'}`}
                    />
                  </span>
                  <h4 className="font-bold text-xs text-[#1E1E24] truncate">{item.name}</h4>
                </div>
                <div className="text-xs font-black text-[#FF6161] mt-0.5">₹{total_price}</div>
                {isUnavailable ? (
                  <p className="text-[10px] font-bold text-rose-700 mt-0.5">
                    Just went out of stock — remove it to continue
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2 bg-[#FAF6F4] border border-[#F2ECE9] text-[#1E1E24] px-2 py-1 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  aria-label={`Remove one ${item.name}`}
                  onClick={() => void updateQuantity(item.id, -1)}
                  className="w-4 h-4 flex items-center justify-center hover:text-[#FF6161]"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="min-w-[14px] text-center font-black">{quantity}</span>
                <button
                  type="button"
                  aria-label={`Add one ${item.name}`}
                  onClick={() => void updateQuantity(item.id, 1)}
                  className="w-4 h-4 flex items-center justify-center hover:text-[#FF6161]"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${item.name} entirely`}
                  onClick={() => void removeItem(item.id)}
                  className="w-4 h-4 flex items-center justify-center text-[#7E7E8B] hover:text-rose-600"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}

        <div className="pt-4 space-y-2">
          <label
            htmlFor="dropoff-location"
            className="text-[11px] font-black text-[#1E1E24] uppercase tracking-wider flex items-center gap-1.5"
          >
            <MapPin className="w-3.5 h-3.5 text-[#FF6161]" /> Delivery Drop-off Point
          </label>
          {isLoadingLocations ? (
            <p className="text-xs text-[#7E7E8B]">Loading drop-off points…</p>
          ) : (
            <select
              id="dropoff-location"
              required
              value={selectedLocationId ?? ''}
              onChange={(event) => setSelectedLocationId(event.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#FAF6F4] border border-[#F2ECE9] text-xs font-bold text-[#1E1E24] focus:outline-none focus:border-[#FF6161]"
            >
              <option value="" disabled>
                Select where to deliver
              </option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}{' '}
                  {location.delivery_allowed_at_door ? '(Doorstep)' : '(Hostel Gate Only)'}
                </option>
              ))}
            </select>
          )}

          <label htmlFor="room-input" className="sr-only">
            Room number or block
          </label>
          <input
            id="room-input"
            type="text"
            required
            value={roomOrFlat}
            onChange={(event) => setRoomOrFlat(event.target.value)}
            placeholder="Room Number / Wing (e.g. Room 312)"
            className="w-full p-2.5 rounded-xl bg-[#FAF6F4] border border-[#F2ECE9] text-xs font-semibold focus:outline-none focus:border-[#FF6161]"
          />
          {selectedLocation && !selectedLocation.delivery_allowed_at_door ? (
            <p className="text-[10px] text-[#7E7E8B] font-semibold">
              This drop-off is hostel-gate only — please collect from the gate.
            </p>
          ) : null}
        </div>

        <div className="pt-3">
          <label htmlFor="instructions-input" className="sr-only">
            Special instructions
          </label>
          <input
            id="instructions-input"
            type="text"
            value={specialInstructions}
            onChange={(event) => setSpecialInstructions(event.target.value)}
            placeholder="Cooking or delivery instructions (e.g. extra spicy, call at gate)..."
            className="w-full p-2.5 rounded-xl bg-[#FAF6F4] border border-[#F2ECE9] text-xs font-medium focus:outline-none focus:border-[#FF6161]"
          />
        </div>

        <fieldset className="pt-3 space-y-1.5">
          <legend className="text-[11px] font-black text-[#1E1E24] uppercase tracking-wider flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-[#FF6161]" /> Payment Mode
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label
              className={`p-2.5 rounded-xl text-left border text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                paymentMethod === 'CASH_ON_DELIVERY'
                  ? 'border-[#FF6161] bg-[#FFF5F4] text-[#FF6161]'
                  : 'border-[#F2ECE9] bg-[#FAF6F4] text-[#7E7E8B]'
              }`}
            >
              <input
                type="radio"
                name="payment-method"
                className="sr-only"
                checked={paymentMethod === 'CASH_ON_DELIVERY'}
                onChange={() => setPaymentMethod('CASH_ON_DELIVERY')}
              />
              <Wallet className="w-3.5 h-3.5" />
              <span>Cash on Delivery</span>
            </label>

            {/* Online payment is disabled rather than shown as working: the
                gateway is not integrated yet, and a fake "captured" state is
                exactly the kind of thing that causes disputes at launch. */}
            <div
              aria-disabled
              className="p-2.5 rounded-xl border border-dashed border-[#F2ECE9] bg-[#FAF6F4] text-xs font-bold text-[#7E7E8B] flex items-center gap-2"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>UPI / Online — not enabled yet</span>
            </div>
          </div>
        </fieldset>
      </div>

      <div className="p-4 border-t border-[#F2ECE9] bg-[#FAF6F4] space-y-2">
        {blockingIssues.length > 0 ? (
          <div role="alert" className="text-[11px] font-bold p-2.5 rounded-xl bg-amber-50 text-amber-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{blockingIssues.map((issue) => issue.message).join(' ')}</span>
          </div>
        ) : null}

        {checkoutError ? <ErrorBanner message={checkoutError} /> : null}

        <dl className="space-y-1 text-xs font-medium text-[#7E7E8B]">
          <div className="flex justify-between">
            <dt>Item Total</dt>
            <dd className="text-[#1E1E24] font-bold">₹{pricing.itemsSubtotal}</dd>
          </div>
          <div className="flex justify-between items-center">
            <dt className="flex items-center gap-1">
              <Bike className="w-3 h-3 text-[#FF6161]" /> Delivery Fee
            </dt>
            <dd className={`font-bold ${pricing.deliveryFee === 0 ? 'text-emerald-600' : 'text-[#1E1E24]'}`}>
              {pricing.deliveryFee === 0 ? 'FREE' : `₹${pricing.deliveryFee}`}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Campus Platform Fee</dt>
            <dd className="text-[#1E1E24] font-bold">₹{pricing.platformFee}</dd>
          </div>
          <div className="pt-2 border-t border-[#F2ECE9] flex justify-between text-sm font-black text-[#1E1E24]">
            <dt>Total Payable</dt>
            <dd className="text-base text-[#FF6161]">₹{pricing.total}</dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={() => void handleCheckout()}
          disabled={isPlacing || blockingIssues.length > 0}
          className="w-full bg-[#FF6161] hover:bg-[#EE4D4D] disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#FF6161]/25 transition"
        >
          {isPlacing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Placing your order…</span>
            </>
          ) : (
            <>
              <span>{user ? `Place Order (₹${pricing.total})` : 'Sign in to Order'}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        <p className="text-[10px] text-center text-[#7E7E8B] flex items-center justify-center gap-1">
          <ShieldCheck className="w-3 h-3 text-[#FF6161]" />
          Handover is verified with your 4-digit delivery PIN
        </p>

        <p className="text-[9px] text-center text-[#7E7E8B]/70 leading-tight pt-1 border-t border-[#F2ECE9]">
          Campus concierge courier. Food safety, preparation &amp; FSSAI compliance are the sole responsibility of the licensed merchant.
        </p>
      </div>
    </div>
  );
}
