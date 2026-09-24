'use client';

import React from 'react';
import { 
  UtensilsCrossed, 
  Moon, 
  Coffee, 
  Scissors, 
  Shirt, 
  Printer, 
  Sparkles,
  Leaf
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
  const categories: { id: CategoryFilter; label: string; icon: any; isNew?: boolean }[] = [
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
                  ? 'bg-[#E95322] text-white shadow-md shadow-[#E95322]/20 scale-102'
                  : 'bg-white text-[#391713] border border-[#F1E9E4] hover:border-[#E95322]/50 hover:bg-[#FAF7F5]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-[#E95322]'}`} />
              <span>{label}</span>
              {isNew && (
                <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-black uppercase tracking-wider ${
                  isActive ? 'bg-white text-[#E95322]' : 'bg-[#FFDECF] text-[#E95322]'
                }`}>
                  New
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Veg Only Toggle Button (Figma Style) */}
      <div className="shrink-0 pl-2 border-l border-[#F1E9E4]">
        <button
          onClick={onToggleVegOnly}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-full text-xs font-bold border transition ${
            isVegOnly
              ? 'bg-emerald-50 text-emerald-800 border-emerald-500 shadow-sm'
              : 'bg-white text-[#7A6A65] border-[#F1E9E4] hover:bg-[#FAF7F5]'
          }`}
        >
          <div className="w-3.5 h-3.5 rounded-sm border border-emerald-600 flex items-center justify-center p-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          </div>
          <span>Pure Veg</span>
        </button>
      </div>
    </div>
  );
}
