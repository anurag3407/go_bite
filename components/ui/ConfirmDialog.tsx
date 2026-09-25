'use client';

// components/ui/ConfirmDialog.tsx
// Replaces window.confirm, which blocks the main thread, cannot be styled, is
// inconsistently dismissed on mobile, and breaks keyboard flow.

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { AlertCircle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  isDestructive = false,
  isBusy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      icon={<AlertCircle className="w-5 h-5" />}
      maxWidthClass="max-w-md"
    >
      <p className="text-sm text-[#7E7E8B] font-medium">{message}</p>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isBusy}
          className="px-4 py-2.5 rounded-2xl text-xs font-bold text-[#1E1E24] bg-white border border-[#F2ECE9] hover:bg-[#FAF6F4] transition disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isBusy}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black text-white transition disabled:opacity-50 ${
            isDestructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#FF6161] hover:bg-[#EE4D4D]'
          }`}
        >
          {isBusy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
