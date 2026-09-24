'use client';

import React, { useState } from 'react';
import { useCart } from '@/lib/store/cart-context';
import { MOCK_ITEMS, MOCK_SHOPS } from '@/lib/mock-data';
import { 
  Store, 
  Clock, 
  Bike, 
  KeyRound, 
  CheckCircle2, 
  AlertCircle, 
  PauseCircle, 
  PlayCircle,
  Plus, 
  Search,
  BellRing,
  UtensilsCrossed,
  DollarSign
} from 'lucide-react';

export function ShopDashboard() {
  const { orders, updateOrderStatus, verifyDeliveryPin } = useCart();
  const shop = MOCK_SHOPS[0]; // YumQuick Night Canteen

  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [pinFeedback, setPinFeedback] = useState<Record<string, { success: boolean; message: string }>>({});
  const [isSnoozed, setIsSnoozed] = useState(shop.is_snoozed);
  const [deliveryFee, setDeliveryFee] = useState(shop.delivery_fee);
  const [itemsAvailability, setItemsAvailability] = useState<Record<string, boolean>>({
    'item-shake': true,
    'item-lasagna': true,
    'item-burger': true,
    'item-curry': true,
    'item-veg-burger': true,
  });

  const shopOrders = orders.filter((o) => o.shop_id === shop.id || o.shop_id === 'shop-yumquick');
  const activeOrders = shopOrders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED');

  const handlePinSubmit = (orderId: string) => {
    const pin = pinInputs[orderId] || '';
    const res = verifyDeliveryPin(orderId, pin);
    setPinFeedback((prev) => ({ ...prev, [orderId]: res }));
  };

  const toggleItemAvailability = (itemId: string) => {
    setItemsAvailability((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Dashboard Top Stats & Controls */}
      <div className="bg-white border border-[#F1E9E4] rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FFDECF] flex items-center justify-center text-[#E95322]">
              <Store className="w-7 h-7 text-[#E95322]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-[#391713]">{shop.name}</h1>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                  Self-Delivering
                </span>
              </div>
              <p className="text-xs text-[#7A6A65] mt-0.5">
                Canteen Kitchen Management • IIT Patna (Bihta)
              </p>
            </div>
          </div>

          {/* Quick Shop Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Kitchen Snooze Toggle */}
            <button
              onClick={() => setIsSnoozed(!isSnoozed)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition ${
                isSnoozed
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              {isSnoozed ? <PauseCircle className="w-4 h-4 text-amber-700" /> : <PlayCircle className="w-4 h-4 text-emerald-700" />}
              <span>{isSnoozed ? 'Kitchen Snoozed (Paused)' : 'Accepting Orders'}</span>
            </button>

            {/* Delivery Fee Adjustment */}
            <div className="flex items-center gap-2 bg-[#FAF7F5] border border-[#F1E9E4] px-3 py-1.5 rounded-2xl text-xs font-bold text-[#391713]">
              <Bike className="w-4 h-4 text-[#E95322]" />
              <span>Shop Fee:</span>
              <input
                type="number"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(Number(e.target.value))}
                className="w-12 bg-white border border-[#F1E9E4] rounded-lg px-1.5 py-0.5 text-center font-black text-[#E95322]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Live Orders Section with PIN Verification */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-[#391713]">Live Kitchen & Delivery Queue</h2>
            <span className="bg-[#E95322] text-white text-xs font-black px-2.5 py-0.5 rounded-full">
              {activeOrders.length} Active
            </span>
          </div>
          <span className="text-xs text-[#7A6A65] font-semibold flex items-center gap-1">
            <BellRing className="w-3.5 h-3.5 text-[#E95322]" /> Audio alert active on new orders
          </span>
        </div>

        {activeOrders.length === 0 ? (
          <div className="bg-white border border-[#F1E9E4] rounded-3xl p-8 text-center text-[#7A6A65]">
            <UtensilsCrossed className="w-10 h-10 text-[#7A6A65]/40 mx-auto mb-2" />
            <p className="font-bold text-sm text-[#391713]">No pending orders right now</p>
            <p className="text-xs">Switch to Customer role and place an order to see live updates!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeOrders.map((ord) => (
              <div key={ord.id} className="bg-white border border-[#F1E9E4] rounded-3xl p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-black text-[#E95322]">{ord.order_number}</span>
                    <h3 className="font-black text-sm text-[#391713]">{ord.customer_name} ({ord.customer_phone})</h3>
                    <p className="text-xs text-[#7A6A65] mt-0.5">{ord.address_summary}</p>
                  </div>
                  <span className="bg-[#FFF4EF] text-[#E95322] border border-[#E95322]/20 text-[10px] font-black px-2.5 py-1 rounded-full uppercase">
                    {ord.status.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Items */}
                <div className="bg-[#FAF7F5] rounded-2xl p-3 space-y-1 text-xs">
                  {ord.items?.map((item) => (
                    <div key={item.id} className="flex justify-between font-semibold text-[#391713]">
                      <span>{item.quantity}x {item.item_name}</span>
                      <span className="font-black text-[#E95322]">₹{item.total_price}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-[#F1E9E4] flex justify-between font-black">
                    <span>Total Bill ({ord.payment?.payment_method})</span>
                    <span>₹{ord.total_amount}</span>
                  </div>
                </div>

                {/* Status Progression Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {ord.status === 'PLACED' && (
                    <button
                      onClick={() => updateOrderStatus(ord.id, 'ACCEPTED')}
                      className="flex-1 bg-[#E95322] hover:bg-[#D44213] text-white py-2 rounded-xl text-xs font-black transition"
                    >
                      Accept Order
                    </button>
                  )}

                  {ord.status === 'ACCEPTED' && (
                    <button
                      onClick={() => updateOrderStatus(ord.id, 'PREPARING')}
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-xl text-xs font-black transition"
                    >
                      Start Cooking
                    </button>
                  )}

                  {ord.status === 'PREPARING' && (
                    <button
                      onClick={() => updateOrderStatus(ord.id, 'OUT_FOR_DELIVERY')}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl text-xs font-black transition"
                    >
                      Send Staff to Hostel Gate
                    </button>
                  )}
                </div>

                {/* PIN Verification Input (Anti-Dispute) */}
                {ord.status === 'OUT_FOR_DELIVERY' && (
                  <div className="pt-3 border-t border-[#F1E9E4] space-y-2">
                    <label className="text-[11px] font-black text-[#391713] uppercase tracking-wider flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-[#E95322]" /> Enter Student Delivery PIN
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={4}
                        placeholder="4-digit PIN"
                        value={pinInputs[ord.id] || ''}
                        onChange={(e) => setPinInputs({ ...pinInputs, [ord.id]: e.target.value })}
                        className="w-32 text-center text-sm font-mono font-black p-2 bg-[#FAF7F5] border border-[#F1E9E4] rounded-xl focus:outline-none focus:border-[#E95322]"
                      />
                      <button
                        onClick={() => handlePinSubmit(ord.id)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-3 py-2 rounded-xl transition"
                      >
                        Verify & Complete Delivery
                      </button>
                    </div>

                    {pinFeedback[ord.id] && (
                      <div className={`text-xs font-bold p-2 rounded-xl flex items-center gap-1.5 ${
                        pinFeedback[ord.id].success ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                      }`}>
                        {pinFeedback[ord.id].success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                        <span>{pinFeedback[ord.id].message}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Menu / Inventory Availability Toggles */}
      <div className="bg-white border border-[#F1E9E4] rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-[#391713]">Live Menu & Stock Toggles</h2>
            <p className="text-xs text-[#7A6A65]">Turn off items when kitchen runs out of ingredients</p>
          </div>
          <button className="flex items-center gap-1.5 bg-[#E95322] text-white px-3.5 py-2 rounded-xl text-xs font-black shadow-sm">
            <Plus className="w-3.5 h-3.5" />
            <span>Add Item</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {MOCK_ITEMS.filter((i) => i.shop_id === 'shop-yumquick').map((item) => {
            const isAvail = itemsAvailability[item.id] ?? true;
            return (
              <div key={item.id} className="p-3 rounded-2xl border border-[#F1E9E4] flex items-center justify-between gap-3 bg-[#FAF7F5]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl bg-cover bg-center shrink-0"
                    style={{ backgroundImage: `url(${item.image_url})` }}
                  />
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs text-[#391713] truncate">{item.name}</h4>
                    <span className="text-xs font-black text-[#E95322]">₹{item.price}</span>
                  </div>
                </div>

                <button
                  onClick={() => toggleItemAvailability(item.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-black transition ${
                    isAvail
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                  }`}
                >
                  {isAvail ? 'In Stock' : 'Sold Out'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
