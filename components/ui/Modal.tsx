'use client';

// components/ui/Modal.tsx
// Accessible dialog primitive shared by every modal in the app. Before this,
// each modal was a plain div: no dialog semantics, no Esc-to-close, no focus
// management and no scroll lock, all of which broke keyboard and screen-reader
// users (and left background content scrollable behind the overlay).

import React, { useCallback, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Tailwind max-width class for the panel. */
  maxWidthClass?: string;
  closeOnBackdrop?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  maxWidthClass = 'max-w-lg',
  closeOnBackdrop = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      // Keep focus inside the dialog while it is open.
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', handleKeyDown);

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog on open.
    const focusTarget = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    focusTarget?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = overflow;
      // Return focus to whatever opened the dialog.
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-white w-full ${maxWidthClass} rounded-3xl shadow-2xl border border-[#F2ECE9] overflow-hidden flex flex-col max-h-[92vh]`}
      >
        <div className="p-5 border-b border-[#F2ECE9] flex items-start justify-between gap-3 bg-[#FAF6F4]">
          <div className="flex items-center gap-3 min-w-0">
            {icon ? (
              <div className="w-10 h-10 rounded-2xl bg-[#FFECEB] flex items-center justify-center text-[#FF6161] shrink-0">
                {icon}
              </div>
            ) : null}
            <div className="min-w-0">
              <h2 id={titleId} className="font-black text-base text-[#1E1E24] truncate">
                {title}
              </h2>
              {subtitle ? <p className="text-xs text-[#7E7E8B] truncate">{subtitle}</p> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-full bg-white hover:bg-[#F2ECE9] flex items-center justify-center text-[#7E7E8B] transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">{children}</div>

        {footer ? <div className="p-4 border-t border-[#F2ECE9] bg-[#FAF6F4]">{footer}</div> : null}
      </div>
    </div>
  );
}
