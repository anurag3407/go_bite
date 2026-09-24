'use client';

import React, { useState } from 'react';
import { useCart } from '@/lib/store/cart-context';
import { 
  X, 
  KeyRound, 
  CheckCircle2, 
  Clock, 
  PhoneCall, 
  MapPin, 
  Bike, 
  AlertCircle,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';

export function LiveTrackingModal() {
  const { activeTrackingOrder, setActiveTrackingOrder, cancelOrder } = useCart();
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('Placed order by mistake');

  if (!activeTrackingOrder) return null;

  const order = activeTrackingOrder;
  const isDelivered = order.status === 'DELIVERED';
  const isCancelled = order.status === 'CANCELLED';

  const steps = [
    { key: 'PLACED', label: 'Order Placed', desc: 'Sent to canteen kitchen' },
    { key: 'ACCEPTED', label: 'Accepted', desc: 'Canteen accepted order' },
    { key: 'PREPARING', label: 'Cooking', desc: 'Fresh food being prepared' },
    { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', desc: 'Staff walking to your hostel gate' },
    { key: 'DELIVERED', label: 'Delivered', desc: 'PIN verified & handed over' },
  ];

  const getStepIndex = (status: string) => {
    switch (status) {
      case 'PLACED': return 0;
      case 'ACCEPTED': return 1;
      case 'PREPARING': return 2;
      case 'OUT_FOR_DELIVERY': return 3;
      case 'DELIVERED': return 4;
      default: return 0;
    }
  };

  const currentStep = getStepIndex(order.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div 
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-[#F1E9E4] overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#F1E9E4] flex items-center justify-between bg-[#FAF7F5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FFDECF] flex items-center justify-center text-[#E95322]">
              <Bike className="w-5 h-5 text-[#E95322]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base text-[#391713]">Live Campus Delivery</h3>
                <span className="text-[10px] bg-white border border-[#F1E9E4] font-bold px-2 py-0.5 rounded-full text-[#7A6A65]">
                  {order.order_number}
                </span>
              </div>
              <p className="text-xs text-[#7A6A65]">From {order.shop_name}</p>
            </div>
          </div>
          <button
            onClick={() => setActiveTrackingOrder(null)}
            className="w-8 h-8 rounded-full bg-white hover:bg-[#F1E9E4] flex items-center justify-center text-[#7A6A65] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* THE 4-DIGIT DELIVERY PIN CARD (From Figma Design) */}
          {!isDelivered && !isCancelled ? (
            <div className="bg-gradient-to-r from-[#FFF4EF] to-[#FFDECF]/60 border-2 border-[#E95322] rounded-3xl p-5 text-center shadow-md relative overflow-hidden">
              <div className="text-[11px] font-black text-[#E95322] uppercase tracking-widest flex items-center justify-center gap-1.5 mb-1">
                <KeyRound className="w-4 h-4" /> Your Hostel Delivery PIN
              </div>
              <div className="text-4xl sm:text-5xl font-black text-[#391713] tracking-widest my-1 font-mono">
                {order.delivery_pin}
              </div>
              <p className="text-xs text-[#7A6A65] max-w-xs mx-auto font-medium">
                Share this 4-digit code with the canteen delivery staff when meeting at the hostel gate.
              </p>
            </div>
          ) : isDelivered ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              <h4 className="font-black text-base text-emerald-900">Order Delivered Successfully!</h4>
              <p className="text-xs text-emerald-700 mt-1">Verified with PIN {order.delivery_pin}. Enjoy your meal!</p>
            </div>
          ) : (
            <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 text-center">
              <AlertCircle className="w-10 h-10 text-rose-600 mx-auto mb-2" />
              <h4 className="font-black text-base text-rose-900">Order Cancelled</h4>
              <p className="text-xs text-rose-700 mt-1">Reason: {order.cancellation_reason}</p>
            </div>
          )}

          {/* Delivery Timeline (Figma 240:3971) */}
          {!isCancelled && (
            <div className="bg-[#FAF7F5] border border-[#F1E9E4] rounded-2xl p-4">
              <div className="text-xs font-black text-[#391713] uppercase tracking-wider mb-3">
                Delivery Timeline
              </div>
              <div className="space-y-4 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-[#E8DED9] before:h-[80%] before:top-3">
                {steps.map((step, idx) => {
                  const isDone = idx <= currentStep;
                  const isCurrent = idx === currentStep;
                  return (
                    <div key={step.key} className="flex items-start gap-3 relative z-10">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold transition-all ${
                          isDone
                            ? 'bg-[#E95322] text-white ring-4 ring-[#FFDECF]'
                            : 'bg-white border-2 border-[#E8DED9] text-[#7A6A65]'
                        }`}
                      >
                        {isDone ? '✓' : idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className={`text-xs font-black ${isCurrent ? 'text-[#E95322]' : 'text-[#391713]'}`}>
                          {step.label}
                        </div>
                        <div className="text-[11px] text-[#7A6A65]">{step.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Destination Hostel Location */}
          <div className="bg-white border border-[#F1E9E4] rounded-2xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#FAF7F5] flex items-center justify-center text-[#E95322]">
                <MapPin className="w-4 h-4 text-[#E95322]" />
              </div>
              <div>
                <div className="text-[10px] text-[#7A6A65] font-bold uppercase">Delivery Destination</div>
                <div className="text-xs font-black text-[#391713]">{order.address_summary}</div>
              </div>
            </div>
          </div>

          {/* Order Items Breakdown */}
          <div className="border border-[#F1E9E4] rounded-2xl p-4 space-y-2">
            <div className="text-xs font-black text-[#391713] uppercase tracking-wider mb-2">Order Items</div>
            {order.items?.map((item) => (
              <div key={item.id} className="flex justify-between text-xs">
                <span className="font-semibold text-[#391713]">
                  {item.quantity}x {item.item_name}
                </span>
                <span className="font-black text-[#E95322]">₹{item.total_price}</span>
              </div>
            ))}
            <div className="pt-2 border-t border-[#F1E9E4] flex justify-between text-xs font-black text-[#391713]">
              <span>Total Paid ({order.payment?.payment_method})</span>
              <span>₹{order.total_amount}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#F1E9E4] bg-[#FAF7F5] flex items-center justify-between gap-3">
          {/* Call Canteen Staff */}
          <a
            href="tel:9876543210"
            className="flex-1 bg-white hover:bg-[#F1E9E4] border border-[#F1E9E4] text-[#391713] py-2.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition"
          >
            <PhoneCall className="w-3.5 h-3.5 text-[#E95322]" />
            <span>Call Canteen Staff</span>
          </a>

          {/* Cancel button if still PLACED */}
          {order.status === 'PLACED' && !isCancelled && (
            <button
              onClick={() => {
                cancelOrder(order.id, 'Student cancelled from app');
              }}
              className="px-4 py-2.5 rounded-2xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition"
            >
              Cancel Order
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
