'use client';

import React from 'react';
import { CatalogItem, Shop } from '@/lib/types';
import { useCart } from '@/lib/store/cart-context';
import { Plus, Minus, Clock, Flame } from 'lucide-react';

interface ItemCardProps {
  item: CatalogItem;
  shop: Shop;
}

export function ItemCard({ item, shop }: ItemCardProps) {
  const { items, addItem, updateQuantity } = useCart();
  const cartItem = items.find((ci) => ci.item.id === item.id);
  const quantity = cartItem?.quantity || 0;

  return (
    <div className="bg-white border border-[#F1E9E4] hover:border-[#E95322]/40 rounded-3xl p-3.5 flex flex-col justify-between transition-all hover:shadow-lg hover:shadow-[#E95322]/5 group">
      <div>
        {/* Image & Bestseller / Veg Indicators */}
        <div className="relative h-40 w-full rounded-2xl overflow-hidden bg-[#FAF7F5] mb-3">
          <div
            className="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-300"
            style={{ backgroundImage: `url(${item.image_url})` }}
          />

          {/* Veg / Non-Veg Indicator */}
          <div className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur-md p-1 rounded-md shadow-sm">
            <div className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center ${
              item.is_veg ? 'border-emerald-600' : 'border-rose-600'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                item.is_veg ? 'bg-emerald-600' : 'bg-rose-600'
              }`} />
            </div>
          </div>

          {/* Bestseller Tag */}
          {item.bestseller && (
            <div className="absolute top-2.5 right-2.5 bg-[#E95322] text-white px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
              <Flame className="w-3 h-3 fill-white" />
              <span>Bestseller</span>
            </div>
          )}

          {/* Duration for salon appointment services */}
          {item.duration_minutes && (
            <div className="absolute bottom-2.5 left-2.5 bg-[#391713]/80 backdrop-blur-md text-[#FFDECF] px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{item.duration_minutes} mins</span>
            </div>
          )}
        </div>

        {/* Title & Description */}
        <div className="space-y-1">
          <h4 className="font-black text-sm text-[#391713] line-clamp-1 group-hover:text-[#E95322] transition">
            {item.name}
          </h4>
          <p className="text-xs text-[#7A6A65] line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        </div>
      </div>

      {/* Pricing & Add/Quantity Actions */}
      <div className="pt-3 mt-3 border-t border-[#F1E9E4] flex items-center justify-between">
        <div className="flex items-baseline gap-1.5">
          <span className="text-base font-black text-[#391713]">
            ₹{item.discounted_price ?? item.price}
          </span>
          {item.discounted_price && (
            <span className="text-xs text-[#7A6A65] line-through font-semibold">
              ₹{item.price}
            </span>
          )}
        </div>

        {/* Counter / Add Button */}
        {quantity > 0 ? (
          <div className="flex items-center gap-2 bg-[#FFF4EF] border border-[#E95322] text-[#E95322] px-2 py-1 rounded-xl font-black text-xs">
            <button
              onClick={() => updateQuantity(item.id, -1)}
              className="w-5 h-5 rounded-md hover:bg-[#FFDECF] flex items-center justify-center transition active:scale-90"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="min-w-[16px] text-center">{quantity}</span>
            <button
              onClick={() => updateQuantity(item.id, 1)}
              className="w-5 h-5 rounded-md hover:bg-[#FFDECF] flex items-center justify-center transition active:scale-90"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => addItem(item, shop)}
            disabled={!item.is_available}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl font-black text-xs transition active:scale-95 shadow-sm ${
              item.is_available
                ? 'bg-[#E95322] hover:bg-[#D44213] text-white shadow-[#E95322]/20'
                : 'bg-[#F1E9E4] text-[#7A6A65] cursor-not-allowed'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{item.is_available ? 'ADD' : 'SOLD OUT'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
