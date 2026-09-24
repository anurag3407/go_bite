'use client';

import React, { useState } from 'react';
import { useCart } from '@/lib/store/cart-context';
import { useCampus } from '@/lib/store/campus-context';
import { MOCK_CAMPUS_LOCATIONS } from '@/lib/mock-data';
import { 
  ShoppingBag, 
  Trash2, 
  Plus, 
  Minus, 
  MapPin, 
  Bike, 
  ShieldCheck, 
  CheckCircle2, 
  CreditCard, 
  ArrowRight,
  Sparkles,
  X
} from 'lucide-react';

interface StickyCartProps {
  isDrawer?: boolean;
}

export function StickyCart({ isDrawer = false }: StickyCartProps) {
  const {
    cartShop,
    items,
    removeItem,
    updateQuantity,
    clearCart,
    subtotal,
    deliveryFee,
    platformFee,
    total,
    selectedAddress,
    setSelectedAddress,
    specialInstructions,
    setSpecialInstructions,
    placeOrder,
    setIsCartDrawerOpen,
  } = useCart();
  const { activeCampus } = useCampus();

  const [paymentMethod, setPaymentMethod] = useState<'UPI_INTENT' | 'CASH_ON_DELIVERY'>('UPI_INTENT');
  const [isPlacing, setIsPlacing] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  const campusLocations = MOCK_CAMPUS_LOCATIONS.filter((l) => l.campus_id === activeCampus.id);

  const handleCheckout = () => {
    setIsPlacing(true);
    setTimeout(() => {
      const order = placeOrder(paymentMethod);
      setOrderSuccess(order.delivery_pin);
      setIsPlacing(false);
    }, 600);
  };

  if (items.length === 0) {
    return (
      <div className={`bg-white border border-[#F1E9E4] rounded-3xl p-6 text-center ${isDrawer ? 'h-full flex flex-col justify-center' : ''}`}>
        <div className="w-16 h-16 rounded-full bg-[#FAF7F5] flex items-center justify-center mx-auto mb-3 text-[#7A6A65]">
          <ShoppingBag className="w-8 h-8 text-[#7A6A65]/50" />
        </div>
        <h3 className="font-black text-base text-[#391713]">Your Campus Cart is Empty</h3>
        <p className="text-xs text-[#7A6A65] mt-1 max-w-xs mx-auto">
          Add meals, midnight snacks, or book grooming and laundry services from your campus vendors.
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-[#F1E9E4] rounded-3xl overflow-hidden flex flex-col shadow-sm ${isDrawer ? 'h-full' : 'sticky top-24 max-h-[calc(100vh-120px)]'}`}>
      {/* Cart Header */}
      <div className="p-4 border-b border-[#F1E9E4] flex items-center justify-between bg-[#FAF7F5]">
        <div>
          <div className="text-[10px] text-[#7A6A65] font-bold uppercase tracking-wider">Ordering From</div>
          <h3 className="font-black text-sm text-[#391713] truncate">{cartShop?.name}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearCart}
            className="text-xs text-[#7A6A65] hover:text-rose-600 font-bold transition flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
          {isDrawer && (
            <button
              onClick={() => setIsCartDrawerOpen(false)}
              className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-[#7A6A65] hover:text-[#391713]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Cart Items List */}
      <div className="p-4 space-y-3 overflow-y-auto flex-1 divide-y divide-[#F1E9E4]">
        {items.map(({ item, quantity }) => (
          <div key={item.id} className="pt-3 first:pt-0 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-xs border flex items-center justify-center ${
                  item.is_veg ? 'border-emerald-600' : 'border-rose-600'
                }`}>
                  <div className={`w-1 h-1 rounded-full ${item.is_veg ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                </div>
                <h4 className="font-bold text-xs text-[#391713] truncate">{item.name}</h4>
              </div>
              <div className="text-xs font-black text-[#E95322] mt-0.5">
                ₹{(item.discounted_price ?? item.price) * quantity}
              </div>
            </div>

            {/* Quantity Controller */}
            <div className="flex items-center gap-2 bg-[#FAF7F5] border border-[#F1E9E4] text-[#391713] px-2 py-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => updateQuantity(item.id, -1)}
                className="w-4 h-4 flex items-center justify-center hover:text-[#E95322]"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="min-w-[14px] text-center font-black">{quantity}</span>
              <button
                onClick={() => updateQuantity(item.id, 1)}
                className="w-4 h-4 flex items-center justify-center hover:text-[#E95322]"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}

        {/* Hostel Delivery Drop-off Selector */}
        <div className="pt-4 space-y-2">
          <label className="text-[11px] font-black text-[#391713] uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#E95322]" /> Delivery Drop-off Point
          </label>
          <select
            value={selectedAddress.campus_location_id}
            onChange={(e) => {
              const loc = campusLocations.find((l) => l.id === e.target.value);
              if (loc) {
                setSelectedAddress({
                  ...selectedAddress,
                  campus_location_id: loc.id,
                  location_name: loc.name,
                });
              }
            }}
            className="w-full p-2.5 rounded-xl bg-[#FAF7F5] border border-[#F1E9E4] text-xs font-bold text-[#391713] focus:outline-none focus:border-[#E95322]"
          >
            {campusLocations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} {loc.delivery_allowed_at_door ? '(Doorstep)' : '(Hostel Gate Only)'}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={selectedAddress.room_or_flat}
            onChange={(e) => setSelectedAddress({ ...selectedAddress, room_or_flat: e.target.value })}
            placeholder="Room Number / Wing (e.g. Room 312)"
            className="w-full p-2.5 rounded-xl bg-[#FAF7F5] border border-[#F1E9E4] text-xs font-semibold focus:outline-none focus:border-[#E95322]"
          />
        </div>

        {/* Special Instructions */}
        <div className="pt-3">
          <input
            type="text"
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            placeholder="Cooking or delivery instructions (e.g. extra spicy, call at gate)..."
            className="w-full p-2.5 rounded-xl bg-[#FAF7F5] border border-[#F1E9E4] text-xs font-medium focus:outline-none focus:border-[#E95322]"
          />
        </div>

        {/* Payment Method Selector (Strategy 1 + Strategy 3) */}
        <div className="pt-3 space-y-1.5">
          <label className="text-[11px] font-black text-[#391713] uppercase tracking-wider flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-[#E95322]" /> Payment Mode
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPaymentMethod('UPI_INTENT')}
              className={`p-2.5 rounded-xl text-left border text-xs font-bold transition flex items-center gap-2 ${
                paymentMethod === 'UPI_INTENT'
                  ? 'border-[#E95322] bg-[#FFF4EF] text-[#E95322]'
                  : 'border-[#F1E9E4] bg-[#FAF7F5] text-[#7A6A65]'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full border border-current flex items-center justify-center p-0.5">
                {paymentMethod === 'UPI_INTENT' && <span className="w-full h-full rounded-full bg-current" />}
              </span>
              <span>Direct UPI (GPay/PhonePe)</span>
            </button>

            <button
              onClick={() => setPaymentMethod('CASH_ON_DELIVERY')}
              className={`p-2.5 rounded-xl text-left border text-xs font-bold transition flex items-center gap-2 ${
                paymentMethod === 'CASH_ON_DELIVERY'
                  ? 'border-[#E95322] bg-[#FFF4EF] text-[#E95322]'
                  : 'border-[#F1E9E4] bg-[#FAF7F5] text-[#7A6A65]'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full border border-current flex items-center justify-center p-0.5">
                {paymentMethod === 'CASH_ON_DELIVERY' && <span className="w-full h-full rounded-full bg-current" />}
              </span>
              <span>Cash on Delivery</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bill Breakdown & Place Order CTA */}
      <div className="p-4 border-t border-[#F1E9E4] bg-[#FAF7F5] space-y-2">
        <div className="space-y-1 text-xs font-medium text-[#7A6A65]">
          <div className="flex justify-between">
            <span>Item Total</span>
            <span className="text-[#391713] font-bold">₹{subtotal}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="flex items-center gap-1">
              <Bike className="w-3 h-3 text-[#E95322]" /> Canteen Self-Delivery Fee
            </span>
            <span className={`font-bold ${deliveryFee === 0 ? 'text-emerald-600' : 'text-[#391713]'}`}>
              {deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}
            </span>
          </div>

          <div className="flex justify-between">
            <span>Campus Platform Fee</span>
            <span className="text-[#391713] font-bold">₹{platformFee}</span>
          </div>

          <div className="pt-2 border-t border-[#F1E9E4] flex justify-between text-sm font-black text-[#391713]">
            <span>Total Payable</span>
            <span className="text-base text-[#E95322]">₹{total}</span>
          </div>
        </div>

        {/* Checkout Button */}
        <button
          onClick={handleCheckout}
          disabled={isPlacing}
          className="w-full bg-[#E95322] hover:bg-[#D44213] text-white py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#E95322]/25 transition active:scale-98 disabled:opacity-50"
        >
          {isPlacing ? (
            <span className="animate-pulse">Generating Delivery PIN...</span>
          ) : (
            <>
              <span>Place Order (₹{total})</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        <p className="text-[10px] text-center text-[#7A6A65]">
          🔒 Secured with 4-Digit Delivery PIN verification upon arrival
        </p>
      </div>
    </div>
  );
}
