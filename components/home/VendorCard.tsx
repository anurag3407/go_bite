'use client';

import React from 'react';
import { Shop } from '@/lib/types';
import { Star, Clock, Bike, Scissors, Shirt, Printer, Sparkles, Check } from 'lucide-react';

interface VendorCardProps {
  shop: Shop;
  isSelected: boolean;
  onSelect: () => void;
}

export function VendorCard({ shop, isSelected, onSelect }: VendorCardProps) {
  const getServiceIcon = () => {
    switch (shop.service_type) {
      case 'SALON_GROOMING':
        return <Scissors className="w-3.5 h-3.5 text-blue-600" />;
      case 'LAUNDRY':
        return <Shirt className="w-3.5 h-3.5 text-indigo-600" />;
      case 'PRINT_STATIONERY':
        return <Printer className="w-3.5 h-3.5 text-purple-600" />;
      default:
        return <Bike className="w-3.5 h-3.5 text-[#E95322]" />;
    }
  };

  const getServiceLabel = () => {
    switch (shop.service_type) {
      case 'SALON_GROOMING': return 'Campus Salon';
      case 'LAUNDRY': return 'Hostel Laundry';
      case 'PRINT_STATIONERY': return 'Printouts & Xerox';
      default: return 'Canteen / Mess';
    }
  };

  return (
    <div
      onClick={onSelect}
      className={`group cursor-pointer rounded-3xl p-3 border transition-all text-left relative bg-white ${
        isSelected
          ? 'border-[#E95322] ring-2 ring-[#E95322]/20 shadow-lg shadow-[#E95322]/10'
          : 'border-[#F1E9E4] hover:border-[#E95322]/50 hover:shadow-md hover:bg-[#FAF7F5]'
      }`}
    >
      {/* Vendor Image Container */}
      <div className="relative h-36 w-full rounded-2xl overflow-hidden bg-[#FAF7F5]">
        <div
          className="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-300"
          style={{ backgroundImage: `url(${shop.image_url})` }}
        />
        
        {/* Rating Badge */}
        <div className="absolute top-2.5 right-2.5 bg-white/90 backdrop-blur-md px-2 py-1 rounded-xl text-xs font-black text-[#391713] flex items-center gap-1 shadow-sm">
          <Star className="w-3.5 h-3.5 fill-[#FFB800] text-[#FFB800]" />
          <span>{shop.rating}</span>
        </div>

        {/* Service Type Tag */}
        <div className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-xl text-[10px] font-bold text-[#391713] flex items-center gap-1.5 shadow-sm">
          {getServiceIcon()}
          <span>{getServiceLabel()}</span>
        </div>

        {/* Operating status badge */}
        {!shop.is_open && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[2px]">
            <span className="bg-red-500 text-white text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
              Closed For Today
            </span>
          </div>
        )}
      </div>

      {/* Info Body */}
      <div className="pt-3 px-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-black text-sm text-[#391713] truncate group-hover:text-[#E95322] transition">
            {shop.name}
          </h3>
          {isSelected && (
            <div className="w-5 h-5 rounded-full bg-[#E95322] text-white flex items-center justify-center shrink-0">
              <Check className="w-3 h-3 stroke-[3]" />
            </div>
          )}
        </div>

        <p className="text-xs text-[#7A6A65] line-clamp-1">{shop.description}</p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 pt-0.5">
          {shop.tags?.slice(0, 3).map((tag, i) => (
            <span key={i} className="text-[10px] font-semibold bg-[#FAF7F5] border border-[#F1E9E4] text-[#7A6A65] px-2 py-0.5 rounded-md">
              {tag}
            </span>
          ))}
        </div>

        {/* Delivery / Prep Time Footer */}
        <div className="pt-2 border-t border-[#F1E9E4] flex items-center justify-between text-xs font-bold text-[#391713]">
          <div className="flex items-center gap-1 text-[#7A6A65]">
            <Clock className="w-3.5 h-3.5 text-[#E95322]" />
            <span>~{shop.prep_time_minutes} mins</span>
          </div>

          <div className="text-[11px] text-[#E95322] font-black">
            {shop.delivery_enabled ? (
              shop.delivery_fee === 0 ? (
                'Free Delivery'
              ) : shop.min_order_for_free_delivery ? (
                `₹${shop.delivery_fee} (Free > ₹${shop.min_order_for_free_delivery})`
              ) : (
                `₹${shop.delivery_fee} Delivery`
              )
            ) : (
              'Store Visit / Slot'
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
