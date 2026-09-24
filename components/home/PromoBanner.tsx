'use client';

import React from 'react';
import { Sparkles, ArrowRight, Clock, ShieldCheck } from 'lucide-react';

export function PromoBanner() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#E95322] via-[#F26436] to-[#FF8154] text-white p-6 sm:p-8 shadow-xl shadow-[#E95322]/15">
      {/* Decorative Background Elements from Figma Frame 71 */}
      <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-32 h-32 bg-[#FFDECF]/20 rounded-full blur-xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="max-w-xl space-y-2">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold tracking-wide">
            <Clock className="w-3.5 h-3.5 text-white" />
            <span>CAMPUS LATE-NIGHT SPECIAL • OPEN TILL 3:00 AM</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
            Craving Midnight Snacks? <br className="hidden sm:inline" />
            <span className="text-[#FFDECF]">30% OFF</span> on Canteen Meals & Shakes
          </h2>

          <p className="text-xs sm:text-sm text-white/90 font-medium">
            Delivered directly to your hostel gate with real-time 4-digit PIN verification. No more lost or delayed deliveries.
          </p>
        </div>

        {/* Banner Action CTA */}
        <div className="shrink-0 flex items-center gap-3">
          <div className="bg-white/10 border border-white/20 backdrop-blur-md px-4 py-3 rounded-2xl text-center hidden sm:block">
            <div className="text-[10px] text-white/80 font-bold uppercase tracking-wider">Use Promo Code</div>
            <div className="text-lg font-black tracking-wider text-[#FFDECF]">CAMPUS30</div>
          </div>

          <a
            href="#canteen-section"
            className="inline-flex items-center gap-2 bg-[#391713] hover:bg-[#250E0B] text-white px-5 py-3.5 rounded-2xl font-black text-xs sm:text-sm shadow-lg transition active:scale-95"
          >
            <span>Order Now</span>
            <ArrowRight className="w-4 h-4 text-[#FFDECF]" />
          </a>
        </div>
      </div>
    </div>
  );
}
