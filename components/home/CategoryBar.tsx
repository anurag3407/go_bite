'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { 
  UtensilsCrossed, 
  Moon, 
  Coffee, 
  Scissors, 
  Shirt, 
  Printer, 
  Sparkles 
} from 'lucide-react';

export type CategoryFilter = 
  | 'ALL'
  | 'FOOD_MEALS'
  | 'NIGHT_MESS'
  | 'SNACKS_DRINKS'
  | 'SALON'
  | 'LAUNDRY'
  | 'PRINT';

interface CategoryBarProps {
  selectedCategory: CategoryFilter;
  onSelectCategory: (cat: CategoryFilter) => void;
  isVegOnly: boolean;
  onToggleVegOnly: () => void;
}

export function CategoryBar({
  selectedCategory,
  onSelectCategory,
  isVegOnly,
  onToggleVegOnly,
}: CategoryBarProps) {
  const categories: { id: CategoryFilter; label: string; icon: LucideIcon; isNew?: boolean }[] = [
    { id: 'ALL', label: 'All Services', icon: Sparkles },
    { id: 'FOOD_MEALS', label: 'Meals & Canteens', icon: UtensilsCrossed },
    { id: 'NIGHT_MESS', label: 'Night Mess (Till 3 AM)', icon: Moon },
    { id: 'SNACKS_DRINKS', label: 'Shakes & Snacks', icon: Coffee },
    { id: 'SALON', label: 'Campus Salon', icon: Scissors, isNew: true },
    { id: 'LAUNDRY', label: 'Hostel Laundry', icon: Shirt, isNew: true },
    { id: 'PRINT', label: 'Print & Stationery', icon: Printer, isNew: true },
  ];

  return (
    <div className="flex items-center justify-between gap-3 overflow-x-auto py-2 px-1 no-scrollbar">
      <div className="flex items-center gap-2">
        {categories.map(({ id, label, icon: Icon, isNew }) => {
          const isActive = selectedCategory === id;
          return (
            <button
              key={id}
              onClick={() => onSelectCategory(id)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold transition-all ${
                isActive
                  ? 'bg-[#FF6161] text-white shadow-md shadow-[#FF6161]/25 scale-102'
                  : 'bg-white text-[#1E1E24] border border-[#F2ECE9] hover:border-[#FF6161]/40 hover:bg-[#FAF6F4]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-[#FF6161]'}`} />
              <span>{label}</span>
              {isNew && (
                <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-black uppercase tracking-wider ${
                  isActive ? 'bg-white text-[#FF6161]' : 'bg-[#FFECEB] text-[#FF6161]'
                }`}>
                  New
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Veg Only Toggle Button */}
      <div className="shrink-0 pl-2 border-l border-[#F2ECE9]">
        <button
          onClick={onToggleVegOnly}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-full text-xs font-bold border transition ${
            isVegOnly
              ? 'bg-emerald-50 text-emerald-800 border-emerald-500 shadow-xs'
              : 'bg-white text-[#7E7E8B] border-[#F2ECE9] hover:bg-[#FAF6F4]'
          }`}
        >
          <div className="w-3.5 h-3.5 rounded-xs border border-emerald-600 flex items-center justify-center p-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          </div>
          <span>Pure Veg</span>
        </button>
      </div>
    </div>
  );
}
