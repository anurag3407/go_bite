import React from 'react';
import { Order } from '@/lib/types';
import { 
  Phone, 
  MessageSquare, 
  MapPin, 
  Star, 
  KeyRound,
  Navigation
} from 'lucide-react';

interface OrderTrackingCardProps {
  order: Order;
  onOpenDetails?: () => void;
}

export function OrderTrackingCard({ order, onOpenDetails }: OrderTrackingCardProps) {
  const isDelivered = order.status === 'DELIVERED';
  const firstItem = order.items?.[0];

  return (
    <div 
      onClick={onOpenDetails}
      className={`card-elevated overflow-hidden bg-white max-w-md mx-auto w-full shadow-lg border border-[#F2ECE9] ${
        onOpenDetails ? 'cursor-pointer transition hover:shadow-xl' : ''
      }`}
    >
      {/* Map Snapshot with Dotted Path (From Reference Image) */}
      <div className="relative h-44 bg-[#F5F5F7] overflow-hidden flex items-center justify-center p-4">
        {/* Subtle Map SVG Background */}
        <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#CBD5E1_1px,transparent_1px)] [background-size:16px_16px]" />
        
        {/* Stylized Dotted Delivery Path from Reference Image */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M 60 30 Q 120 20 180 60 T 260 110"
            fill="none"
            stroke="#FF6161"
            strokeWidth="3"
            strokeDasharray="6 6"
          />
        </svg>

        {/* Start Point (Canteen) */}
        <div className="absolute top-5 left-12 flex flex-col items-center">
          <div className="w-6 h-6 rounded-full bg-[#FF6161] text-white flex items-center justify-center text-[10px] shadow-md ring-4 ring-[#FFECEB]">
            <MapPin className="w-3.5 h-3.5" />
          </div>
          <span className="text-[10px] font-bold text-[#7E7E8B] mt-1 bg-white/90 px-1.5 py-0.2 rounded-md shadow-xs">
            Canteen
          </span>
        </div>

        {/* Destination (Hostel Gate) */}
        <div className="absolute bottom-6 right-16 flex flex-col items-center">
          <div className="w-7 h-7 rounded-full bg-[#1E1E24] text-white flex items-center justify-center text-[10px] shadow-md ring-4 ring-white">
            <Navigation className="w-3.5 h-3.5 text-[#FF6161]" />
          </div>
          <span className="text-[10px] font-bold text-[#1E1E24] mt-1 bg-white/90 px-1.5 py-0.2 rounded-md shadow-xs">
            Hostel Gate
          </span>
        </div>

        {/* Floating Status Pill (From Reference Image) */}
        <div className="absolute bottom-3 bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-md border border-[#F2ECE9] flex items-center gap-2 text-xs font-bold text-[#1E1E24]">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>{isDelivered ? 'Order Delivered' : 'Your order is on the way'}</span>
        </div>
      </div>

      {/* Coral Header Bar: Order #ID (From Reference Image) */}
      <div className="bg-[#FF6161] text-white py-3 px-6 text-center font-black text-sm tracking-wide">
        Order #{order.order_number}
      </div>

      {/* Driver / Staff Profile & Contact (From Reference Image) */}
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-cover bg-center ring-2 ring-[#FFECEB]"
              style={{ backgroundImage: `url('https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80')` }}
            />
            <div>
              <h4 className="font-black text-sm text-[#1E1E24]">Rajesh Kumar</h4>
              <div className="flex items-center gap-1 text-[#F59E0B] text-xs">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3 h-3 fill-current" />
                ))}
              </div>
            </div>
          </div>

          {/* Chat & Call Icons */}
          <div className="flex items-center gap-2">
            <button className="w-9 h-9 rounded-full bg-[#FAF6F4] hover:bg-[#FFECEB] text-[#FF6161] flex items-center justify-center transition">
              <MessageSquare className="w-4 h-4" />
            </button>
            <a 
              href="tel:9876543210"
              className="w-9 h-9 rounded-full bg-[#FAF6F4] hover:bg-[#FFECEB] text-[#FF6161] flex items-center justify-center transition"
            >
              <Phone className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Route Progress Dots (From Reference Image) */}
        <div className="bg-[#FAF6F4] rounded-2xl p-3 flex items-center justify-between text-xs">
          <div className="text-left">
            <div className="font-black text-[#1E1E24]">Canteen Spot</div>
            <div className="text-[11px] text-[#7E7E8B]">Bihta Campus</div>
          </div>

          <div className="flex-1 px-4 flex items-center justify-center">
            <div className="w-full flex items-center">
              <div className="w-2.5 h-2.5 rounded-full bg-[#FF6161]" />
              <div className="flex-1 border-t-2 border-dashed border-[#FF6161]" />
              <div className="w-3 h-3 rounded-full bg-[#FF6161] ring-4 ring-[#FFECEB]" />
              <div className="flex-1 border-t-2 border-dashed border-[#E8DED9]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#E8DED9]" />
            </div>
          </div>

          <div className="text-right">
            <div className="font-black text-[#1E1E24]">Hostel Gate</div>
            <div className="text-[11px] text-[#7E7E8B]">Block A / Rm 312</div>
          </div>
        </div>

        {/* Item Preview Card (From Reference Image) */}
        {firstItem && (
          <div className="border border-[#F2ECE9] rounded-2xl p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full bg-cover bg-center shrink-0 shadow-sm ring-2 ring-white"
                style={{ backgroundImage: `url('https://images.unsplash.com/photo-1553787499-6f9133860278?auto=format&fit=crop&w=200&q=80')` }}
              />
              <div>
                <div className="text-[10px] text-[#7E7E8B] font-bold">Arriving in 15 mins</div>
                <div className="font-black text-xs text-[#1E1E24]">
                  {firstItem.quantity}x {firstItem.item_name}
                </div>
                <div className="font-black text-xs text-[#FF6161]">₹{firstItem.total_price}</div>
              </div>
            </div>

            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-1 rounded-full uppercase">
              Paid
            </span>
          </div>
        )}

        {/* 4-Digit Delivery PIN Highlight */}
        <div className="bg-[#FFECEB] border border-[#FF6161]/30 rounded-2xl p-3 text-center">
          <div className="text-[10px] font-bold text-[#FF6161] uppercase tracking-wider flex items-center justify-center gap-1">
            <KeyRound className="w-3 h-3" /> Hostel Delivery PIN
          </div>
          <div className="text-2xl font-black font-mono tracking-widest text-[#1E1E24]">
            {order.delivery_pin}
          </div>
          <div className="text-[10px] text-[#7E7E8B]">
            Show this PIN to delivery staff to collect your order
          </div>
        </div>
      </div>
    </div>
  );
}
