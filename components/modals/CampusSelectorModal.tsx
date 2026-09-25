'use client';

// components/modals/CampusSelectorModal.tsx
// Campus picker. Adds a "use my location" action that calls the geofence
// resolver, and replaces the hand-rolled dialog with the accessible Modal.

import React, { useMemo, useState } from 'react';
import { useCampus } from '@/lib/store/campus-context';
import { errorMessage } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { CheckCircle2, Loader2, MapPin, Navigation, Search } from 'lucide-react';

export function CampusSelectorModal() {
  const {
    allCampuses,
    activeCampus,
    setActiveCampus,
    isCampusSelectorOpen,
    setIsCampusSelectorOpen,
    detectCampusByLocation,
    isLoading,
  } = useCampus();

  const [searchQuery, setSearchQuery] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return allCampuses;
    return allCampuses.filter((campus) =>
      `${campus.name} ${campus.code} ${campus.tagline ?? ''}`.toLowerCase().includes(query),
    );
  }, [allCampuses, searchQuery]);

  const handleDetect = async () => {
    setIsDetecting(true);
    setError(null);
    setDetectionMessage(null);
    try {
      const result = await detectCampusByLocation();
      if (result.campus) {
        await setActiveCampus(result.campus);
        return;
      }
      setDetectionMessage(
        result.distanceMeters !== null
          ? `You appear to be about ${Math.round(result.distanceMeters / 1000)} km from the nearest campus. Pick one below.`
          : 'We could not determine your location. Pick your campus below.',
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsDetecting(false);
    }
  };

  return (
    <Modal
      isOpen={isCampusSelectorOpen}
      onClose={() => setIsCampusSelectorOpen(false)}
      title="Select Your Campus"
      subtitle="You will only see canteens, shops & services available at that campus"
      icon={<MapPin className="w-5 h-5" />}
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7E7E8B]" />
          <label htmlFor="campus-search" className="sr-only">
            Search campuses
          </label>
          <input
            id="campus-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search campus name, IIT, NIT, Bihta, Kanpur..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#FAF6F4] border border-[#F2ECE9] text-xs font-semibold focus:outline-none focus:border-[#FF6161] focus:bg-white transition"
          />
        </div>

        <button
          type="button"
          onClick={() => void handleDetect()}
          disabled={isDetecting}
          className="w-full flex items-center justify-center gap-2 bg-[#FFF5F4] hover:bg-[#FFECEB] border border-[#FF6161]/30 text-[#FF6161] py-2.5 rounded-2xl text-xs font-black transition disabled:opacity-50"
        >
          {isDetecting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Navigation className="w-4 h-4" />
          )}
          {isDetecting ? 'Detecting your campus…' : 'Use my current location'}
        </button>

        {detectionMessage ? (
          <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            {detectionMessage}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-[11px] font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-3">
            {error}
          </p>
        ) : null}

        {isLoading ? (
          <p className="text-xs text-[#7E7E8B] text-center py-4">Loading campuses…</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((campus) => {
              const isSelected = campus.id === activeCampus?.id;
              return (
                <button
                  key={campus.id}
                  type="button"
                  onClick={() => void setActiveCampus(campus)}
                  aria-pressed={isSelected}
                  className={`w-full text-left p-4 rounded-2xl border transition-all flex items-start gap-4 ${
                    isSelected
                      ? 'border-[#FF6161] bg-[#FFF5F4] ring-2 ring-[#FF6161]/20'
                      : 'border-[#F2ECE9] hover:border-[#FF6161]/60 hover:bg-[#FAF6F4]'
                  }`}
                >
                  <span
                    aria-hidden
                    className="w-14 h-14 rounded-2xl bg-cover bg-center shrink-0 border border-[#F2ECE9]"
                    style={{ backgroundImage: `url(${campus.image_url})` }}
                  />

                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-black text-[#1E1E24] truncate">
                        {campus.name}
                      </span>
                      <span className="bg-[#FAF6F4] border border-[#F2ECE9] text-[#7E7E8B] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                        {campus.code}
                      </span>
                    </span>
                    <span className="block text-xs text-[#7E7E8B] mt-1">{campus.tagline}</span>
                    <span className="flex items-center gap-1 mt-2 text-[11px] font-semibold text-[#FF6161]">
                      <Navigation className="w-3 h-3" /> Delivery active (~
                      {campus.radius_meters / 1000}km geofence)
                    </span>
                  </span>

                  {isSelected ? (
                    <CheckCircle2 className="w-6 h-6 text-[#FF6161] shrink-0 mt-1" />
                  ) : null}
                </button>
              );
            })}

            {filtered.length === 0 ? (
              <div className="text-center py-8 text-[#7E7E8B]">
                <p className="text-sm font-bold">No campuses found</p>
                <p className="text-xs mt-1">Want your college campus onboarded? Contact Go-Bite!</p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Modal>
  );
}
