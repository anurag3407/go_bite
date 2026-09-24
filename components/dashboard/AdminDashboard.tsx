'use client';

import React, { useState } from 'react';
import { useCampus } from '@/lib/store/campus-context';
import { MOCK_SHOPS, MOCK_CAMPUS_LOCATIONS } from '@/lib/mock-data';
import { 
  ShieldCheck, 
  MapPin, 
  Store, 
  Plus, 
  TrendingUp, 
  DollarSign, 
  Users, 
  SlidersHorizontal,
  Scissors,
  Shirt,
  Printer,
  Bike
} from 'lucide-react';

export function AdminDashboard() {
  const { allCampuses, activeCampus, setActiveCampus } = useCampus();
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [vendorName, setVendorName] = useState('');
  const [vendorType, setVendorType] = useState('FOOD_DINING');

  const campusShops = MOCK_SHOPS.filter((s) => s.campus_id === activeCampus.id);

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Top Banner */}
      <div className="bg-white border border-[#F1E9E4] rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-700">
              <ShieldCheck className="w-8 h-8 text-purple-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-[#391713]">Super Admin Command Portal</h1>
                <span className="bg-purple-100 text-purple-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                  Cross-Campus Control
                </span>
              </div>
              <p className="text-xs text-[#7A6A65] mt-0.5">
                Multi-Campus Geofencing, Vendor Onboarding & Financial Ledger
              </p>
            </div>
          </div>

          {/* Campus Switcher within Admin */}
          <div className="flex items-center gap-2 bg-[#FAF7F5] border border-[#F1E9E4] p-1.5 rounded-2xl">
            <MapPin className="w-4 h-4 text-[#E95322] ml-2" />
            <select
              value={activeCampus.id}
              onChange={(e) => {
                const found = allCampuses.find((c) => c.id === e.target.value);
                if (found) setActiveCampus(found);
              }}
              className="bg-transparent font-bold text-xs text-[#391713] focus:outline-none pr-3 py-1 cursor-pointer"
            >
              {allCampuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#F1E9E4] rounded-3xl p-5 shadow-sm space-y-1">
          <div className="text-[10px] font-bold text-[#7A6A65] uppercase tracking-wider">Gross Platform Volume</div>
          <div className="text-2xl font-black text-[#391713]">₹1,48,920</div>
          <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> +18.4% this week
          </div>
        </div>

        <div className="bg-white border border-[#F1E9E4] rounded-3xl p-5 shadow-sm space-y-1">
          <div className="text-[10px] font-bold text-[#7A6A65] uppercase tracking-wider">Active Campus Vendors</div>
          <div className="text-2xl font-black text-[#E95322]">{campusShops.length} Vendors</div>
          <div className="text-[11px] text-[#7A6A65]">Across Food, Salon & Laundry</div>
        </div>

        <div className="bg-white border border-[#F1E9E4] rounded-3xl p-5 shadow-sm space-y-1">
          <div className="text-[10px] font-bold text-[#7A6A65] uppercase tracking-wider">Delivery Success Rate</div>
          <div className="text-2xl font-black text-emerald-600">99.4%</div>
          <div className="text-[11px] text-[#7A6A65]">Secured with 4-Digit PIN</div>
        </div>

        <div className="bg-white border border-[#F1E9E4] rounded-3xl p-5 shadow-sm space-y-1">
          <div className="text-[10px] font-bold text-[#7A6A65] uppercase tracking-wider">Hostel Drop Zones</div>
          <div className="text-2xl font-black text-purple-600">6 Zones</div>
          <div className="text-[11px] text-[#7A6A65]">Bihta Campus Perimeter</div>
        </div>
      </div>

      {/* Onboarded Vendors Table & Action */}
      <div className="bg-white border border-[#F1E9E4] rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-[#391713]">Vendors in {activeCampus.name}</h2>
            <p className="text-xs text-[#7A6A65]">Canteens, Salons, and Laundry services registered under Strategy 1</p>
          </div>
          <button
            onClick={() => setShowAddVendor(!showAddVendor)}
            className="flex items-center gap-1.5 bg-[#E95322] hover:bg-[#D44213] text-white px-4 py-2 rounded-2xl text-xs font-black transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Onboard New Vendor</span>
          </button>
        </div>

        {/* Add Vendor Form (Collapsible) */}
        {showAddVendor && (
          <div className="bg-[#FAF7F5] border border-[#F1E9E4] rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-black text-[#391713] uppercase tracking-wider">Add Campus Merchant</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Merchant / Shop Name"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                className="p-2.5 rounded-xl bg-white border border-[#F1E9E4] text-xs font-semibold"
              />
              <select
                value={vendorType}
                onChange={(e) => setVendorType(e.target.value)}
                className="p-2.5 rounded-xl bg-white border border-[#F1E9E4] text-xs font-semibold"
              >
                <option value="FOOD_DINING">Canteen / Food & Dining</option>
                <option value="SALON_GROOMING">Campus Salon & Grooming</option>
                <option value="LAUNDRY">Hostel Laundry Service</option>
                <option value="PRINT_STATIONERY">Stationery & Printouts</option>
              </select>
              <button
                onClick={() => {
                  alert(`Merchant "${vendorName || 'New Vendor'}" registered successfully under ${activeCampus.name}!`);
                  setShowAddVendor(false);
                }}
                className="bg-[#391713] text-white rounded-xl text-xs font-black py-2.5"
              >
                Save & Issue Login
              </button>
            </div>
          </div>
        )}

        {/* Vendors Grid */}
        <div className="divide-y divide-[#F1E9E4]">
          {campusShops.map((shop) => (
            <div key={shop.id} className="py-3.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl bg-cover bg-center shrink-0 border border-[#F1E9E4]"
                  style={{ backgroundImage: `url(${shop.image_url})` }}
                />
                <div>
                  <h4 className="font-black text-sm text-[#391713]">{shop.name}</h4>
                  <div className="flex items-center gap-2 text-xs text-[#7A6A65]">
                    <span className="font-semibold">{shop.phone}</span>
                    <span>•</span>
                    <span className="text-[#E95322] font-bold">
                      {shop.delivery_enabled ? `Shop Fee: ₹${shop.delivery_fee}` : 'Appointment Only'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="bg-[#FAF7F5] border border-[#F1E9E4] text-[#391713] text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">
                  {shop.service_type}
                </span>
                <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                  Active
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
