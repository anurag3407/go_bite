'use client';

import React, { useState } from 'react';
import { CatalogItem, Shop } from '@/lib/types';
import { useCart } from '@/lib/store/cart-context';
import { ShoppingBag, ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface DishShowcaseProps {
  items: CatalogItem[];
  shop: Shop;
}

export function DishShowcase({ items, shop }: DishShowcaseProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { addItem, cart } = useCart();
  const cartItems = cart?.items ?? [];

  const currentItem = items[selectedIndex] || items[0];
  if (!currentItem) return null;

  const isInCart = cartItems.some((ci) => ci.item.id === currentItem.id);

  return (
    <div className="card-elevated overflow-hidden bg-white max-w-md mx-auto w-full relative group">
      {/* Curved Coral Arch Top Header (From Reference Image) */}
      <div className="relative bg-[#FF6161] pt-6 pb-20 px-6 text-white text-center rounded-b-[42px] overflow-hidden shadow-inner">
        <div className="flex items-center justify-between relative z-10">
          <button 
            onClick={() => setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1))}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md flex items-center justify-center transition active:scale-90"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <span className="font-black text-sm uppercase tracking-widest text-white/95">
            Campus Special
          </span>

          <button 
            onClick={() => setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0))}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md flex items-center justify-center transition active:scale-90"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Large Circular Food Platter with Shadow (From Reference Image) */}
        <div className="relative mt-4 flex justify-center">
          <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-full p-2 bg-white/10 backdrop-blur-sm ring-8 ring-white/20 shadow-2xl">
            <div
              className="w-full h-full rounded-full bg-cover bg-center shadow-xl transition-transform duration-500 hover:scale-105"
              style={{ backgroundImage: `url(${currentItem.image_url})` }}
            />
          </div>
        </div>
      </div>

      {/* Item Details */}
      <div className="pt-6 pb-8 px-6 text-center space-y-3">
        <h3 className="text-2xl font-black text-[#1E1E24] tracking-tight">
          {currentItem.name}
        </h3>

        <div className="flex items-center justify-center gap-2">
          <span className="text-xs font-bold text-[#7E7E8B]">Full Portion</span>
          <span className="text-xs text-[#7E7E8B]">•</span>
          <span className="text-xl font-black text-[#1E1E24]">
            ₹{currentItem.discounted_price ?? currentItem.price}
          </span>
          {currentItem.discounted_price && (
            <span className="text-xs font-bold text-[#7E7E8B] line-through">
              ₹{currentItem.price}
            </span>
          )}
        </div>

        <p className="text-xs text-[#7E7E8B] max-w-xs mx-auto line-clamp-2 leading-relaxed">
          {currentItem.description}
        </p>

        {/* Big Coral "Add to cart" Pill Button (From Reference Image) */}
        <div className="pt-2">
          <button
            onClick={() => addItem(currentItem, shop)}
            className="bg-[#FF6161] hover:bg-[#EE4D4D] text-white px-8 py-3 rounded-full font-black text-sm tracking-wide shadow-lg shadow-[#FF6161]/35 hover:shadow-xl hover:shadow-[#FF6161]/45 transition active:scale-95 inline-flex items-center gap-2"
          >
            {isInCart ? (
              <>
                <Check className="w-4 h-4" />
                <span>Added in Cart</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-4 h-4" />
                <span>Add to cart</span>
              </>
            )}
          </button>
        </div>

        {/* Carousel Thumbnails Row Below (From Reference Image) */}
        <div className="pt-4 flex items-center justify-center gap-3">
          {items.slice(0, 4).map((item, idx) => {
            const isCurrent = idx === selectedIndex;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedIndex(idx)}
                className={`relative w-12 h-12 rounded-full overflow-hidden border-2 transition-all ${
                  isCurrent
                    ? 'border-[#FF6161] ring-4 ring-[#FFECEB] scale-110 shadow-md'
                    : 'border-[#F2ECE9] opacity-70 hover:opacity-100 hover:scale-105'
                }`}
              >
                <div
                  className="w-full h-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${item.image_url})` }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
