'use client';

// components/ui/States.tsx
// Shared loading / empty / error surfaces. The prototype had none of these, so
// every network operation either showed stale mock data or nothing at all.

import React from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';

export function LogoLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-white border border-[#F2ECE9] rounded-3xl p-10 flex flex-col items-center justify-center gap-3"
    >
      <Loader2 className="w-6 h-6 animate-spin text-[#FF6161]" />
      <p className="text-xs font-bold text-[#7E7E8B]">{label}</p>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-[#F2ECE9] rounded-3xl p-10 text-center">
      {icon ? (
        <div className="w-16 h-16 rounded-full bg-[#FAF6F4] flex items-center justify-center mx-auto mb-3 text-[#7E7E8B]">
          {icon}
        </div>
      ) : null}
      <h3 className="font-black text-base text-[#1E1E24]">{title}</h3>
      {description ? (
        <p className="text-xs text-[#7E7E8B] mt-1 max-w-sm mx-auto">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start justify-between gap-3"
    >
      <div className="flex items-start gap-2 min-w-0">
        <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
        <p className="text-xs font-bold text-rose-800">{message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-xs font-black text-rose-700 hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      ) : null}
    </div>
  );
}

/** Inline field-level error used by forms. */
export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[11px] font-bold text-rose-700">
      {message}
    </p>
  );
}
