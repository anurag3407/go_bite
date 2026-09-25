'use client';

import React, { useState } from 'react';
import { CatalogItem, Shop } from '@/lib/types';
import { useCart } from '@/lib/store/cart-context';
import { Plus, Minus, Clock } from 'lucide-react';

interface ItemCardProps {
  item: CatalogItem;
  shop: Shop;
}

export function ItemCard({ item, shop }: ItemCardProps) {
  const { cart, addItem, updateQuantity } = useCart();
  const [extraTopping, setExtraTopping] = useState(false);

  // Quantity comes from the server-side cart, so it stays correct across
  // devices and cannot be tampered with locally.
  const cartItem = cart?.items.find((line) => line.item.id === item.id);
  const quantity = cartItem?.quantity ?? 0;

  return (
    <div className={`card-elevated card-hover p-4 bg-white flex items-center justify-between gap-4 relative overflow-hidden transition-all ${
      quantity > 0 ? 'ring-2 ring-[#FF6161]/25 border-[#FF6161]/50' : 'border-[#F2ECE9]'
    }`}>
      {/* Food Avatar / Circular Thumbnail (From Reference Image) */}
      <div className="relative shrink-0">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full p-1 bg-white ring-2 ring-[#F2ECE9] shadow-md overflow-hidden">
          <div
            className="w-full h-full rounded-full bg-cover bg-center transition-transform duration-300 hover:scale-110"
            style={{ backgroundImage: `url(${item.image_url})` }}
          />
        </div>

        {/* Veg / Non-Veg Indicator Pin */}
        <div className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-md shadow-xs border border-[#F2ECE9]">
          <div className={`w-3 h-3 rounded-xs border flex items-center justify-center ${
            item.is_veg ? 'border-emerald-600' : 'border-rose-600'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${item.is_veg ? 'bg-emerald-600' : 'bg-rose-600'}`} />
          </div>
        </div>
      </div>

      {/* Item Details (From Reference Image) */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-black text-sm sm:text-base text-[#1E1E24] truncate">
            {item.name}
          </h4>
          <span className="font-black text-sm sm:text-base text-[#1E1E24] shrink-0">
            ₹{item.discounted_price ?? item.price}
          </span>
        </div>

        <p className="text-xs text-[#7E7E8B] line-clamp-1">
          {item.description}
        </p>

        {/* Duration for salon appointments or Add Extra Topping checkbox */}
        <div className="flex items-center justify-between pt-1">
          {item.duration_minutes ? (
            <div className="text-[11px] font-bold text-[#FF6161] flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{item.duration_minutes} mins slot</span>
            </div>
          ) : (
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-[#7E7E8B] select-none hover:text-[#1E1E24]">
              <input
                type="checkbox"
                checked={extraTopping}
                onChange={() => setExtraTopping(!extraTopping)}
                className="w-3.5 h-3.5 rounded-sm accent-[#FF6161] cursor-pointer"
              />
              <span>Add Extra Topping</span>
            </label>
          )}

          {/* Quantity Pill Controller (From Reference Image: - 1 +) */}
          <div className="flex items-center gap-2 bg-[#FAF6F4] border border-[#F2ECE9] text-[#1E1E24] px-2.5 py-1 rounded-full text-xs font-bold">
            {quantity > 0 ? (
              <>
                <button
                  onClick={() => updateQuantity(item.id, -1)}
                  className="w-4 h-4 flex items-center justify-center hover:text-[#FF6161] transition active:scale-75"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="min-w-[14px] text-center font-black text-[#FF6161]">{quantity}</span>
                <button
                  onClick={() => updateQuantity(item.id, 1)}
                  className="w-4 h-4 flex items-center justify-center hover:text-[#FF6161] transition active:scale-75"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </>
            ) : (
              <button
                onClick={() => addItem(item, shop)}
                disabled={!item.is_available}
                className={`font-black text-xs px-2 transition ${
                  item.is_available
                    ? 'text-[#FF6161] hover:text-[#EE4D4D]'
                    : 'text-[#7E7E8B] cursor-not-allowed'
                }`}
              >
                {item.is_available ? '+ Add' : 'Sold Out'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
