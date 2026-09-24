'use client';

import React, { useState } from 'react';
import { useCampus } from '@/lib/store/campus-context';
import { MapPin, CheckCircle2, Navigation, Search, X, Sparkles } from 'lucide-react';

export function CampusSelectorModal() {
  const { allCampuses, activeCampus, setActiveCampus, isCampusSelectorOpen, setIsCampusSelectorOpen } = useCampus();
  const [searchQuery, setSearchQuery] = useState('');

  if (!isCampusSelectorOpen) return null;

  const filtered = allCampuses.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.tagline?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div 
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-[#F1E9E4] overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-[#F1E9E4] flex items-center justify-between bg-gradient-to-r from-[#FAF7F5] to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FFDECF] flex items-center justify-center text-[#E95322]">
              <MapPin className="w-5 h-5 text-[#E95322]" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#391713]">Select Your Campus</h2>
              <p className="text-xs text-[#7A6A65]">You will only see canteens, shops & services available nearby</p>
            </div>
          </div>
          <button
            onClick={() => setIsCampusSelectorOpen(false)}
            className="w-8 h-8 rounded-full bg-[#FAF7F5] hover:bg-[#F1E9E4] flex items-center justify-center text-[#7A6A65] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-[#F1E9E4] bg-white">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A6A65]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search campus name, IIT, NIT, Bihta, Kanpur..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#FAF7F5] border border-[#F1E9E4] text-xs font-semibold focus:outline-none focus:border-[#E95322] focus:bg-white transition"
              autoFocus
            />
          </div>
        </div>

        {/* Campus List */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {filtered.map((campus) => {
            const isSelected = campus.id === activeCampus.id;
            return (
              <button
                key={campus.id}
                onClick={() => setActiveCampus(campus)}
                className={`w-full text-left p-4 rounded-2xl border transition-all flex items-start gap-4 ${
                  isSelected
                    ? 'border-[#E95322] bg-[#FFF4EF] shadow-md shadow-[#E95322]/10 ring-2 ring-[#E95322]/20'
                    : 'border-[#F1E9E4] hover:border-[#E95322]/60 hover:bg-[#FAF7F5]'
                }`}
              >
                <div
                  className="w-14 h-14 rounded-2xl bg-cover bg-center shrink-0 border border-[#F1E9E4]"
                  style={{ backgroundImage: `url(${campus.image_url})` }}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-[#391713] truncate">{campus.name}</span>
                    <span className="bg-[#FAF7F5] border border-[#F1E9E4] text-[#7A6A65] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                      {campus.code}
                    </span>
                  </div>
                  <p className="text-xs text-[#7A6A65] mt-1">{campus.tagline}</p>
                  
                  <div className="flex items-center gap-3 mt-2 text-[11px] font-semibold text-[#E95322]">
                    <span className="flex items-center gap-1">
                      <Navigation className="w-3 h-3" /> Delivery active (~{campus.radius_meters / 1000}km geofence)
                    </span>
                  </div>
                </div>

                {isSelected && (
                  <CheckCircle2 className="w-6 h-6 text-[#E95322] shrink-0 mt-1" />
                )}
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-8 text-[#7A6A65]">
              <p className="text-sm font-bold">No campuses found</p>
              <p className="text-xs mt-1">Want your college campus onboarded? Contact Go-Bite team!</p>
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="p-4 bg-[#FAF7F5] border-t border-[#F1E9E4] text-[11px] text-[#7A6A65] flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-[#E95322]" /> Campus-specific pricing and hostel delivery
          </span>
          <span className="font-bold text-[#391713]">3 Campuses Live</span>
        </div>
      </div>
    </div>
  );
}
