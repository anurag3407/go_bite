'use client';

// components/orders/LiveTrackingModal.tsx
// Customer order tracking. The 4-digit PIN is shown here and ONLY here — it is
// stripped from every other response server-side. Cancel and dispute now call
// the API (and are rejected by the state machine when not allowed) instead of
// mutating local state.

import React, { useState, useCallback } from 'react';
import { useCart } from '@/lib/store/cart-context';
import { api, errorMessage } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { ErrorBanner } from '@/components/ui/States';
import {
  AlertCircle,
  Bike,
  CheckCircle2,
  ChevronRight,
  Clock,
  KeyRound,
  Loader2,
  MapPin,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { Order, OrderStatus } from '@/lib/types';

const STEPS: { key: OrderStatus; label: string; desc: string }[] = [
  { key: 'PLACED', label: 'Order Placed', desc: 'Sent to the merchant kitchen' },
  { key: 'ACCEPTED', label: 'Accepted', desc: 'Merchant accepted your order' },
  { key: 'PREPARING', label: 'Preparing', desc: 'Your order is being prepared' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', desc: 'Staff on the way to your gate' },
  { key: 'DELIVERED', label: 'Delivered', desc: 'PIN verified and handed over' },
];

const STATUS_INDEX: Partial<Record<OrderStatus, number>> = {
  PLACED: 0,
  ACCEPTED: 1,
  PREPARING: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
};

export function LiveTrackingModal() {
  const {
    activeTrackingOrder: order,
    setActiveTrackingOrder,
    cancelOrder,
    disputeOrder,
    refreshOrders,
  } = useCart();

  const [mode, setMode] = useState<'none' | 'cancel' | 'dispute' | 'ticket'>('none');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRotatingPin, setIsRotatingPin] = useState(false);

  const handleRotatePin = async () => {
    if (!order) return;
    setIsRotatingPin(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<{ order: Order }>(`/api/v1/orders/${order.id}/actions`, {
        action: 'rotate-pin',
      });
      setActiveTrackingOrder(res.order);
      setNotice('New delivery PIN generated.');
      void refreshOrders();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsRotatingPin(false);
    }
  };

  const [prevOrderId, setPrevOrderId] = useState<string | null>(order?.id ?? null);
  if (order && order.id !== prevOrderId) {
    setPrevOrderId(order.id);
    setMode('none');
    setReason('');
    setError(null);
    setNotice(null);
  }

  const handleClose = useCallback(() => {
    setMode('none');
    setReason('');
    setError(null);
    setNotice(null);
    setActiveTrackingOrder(null);
  }, [setActiveTrackingOrder]);

  if (!order) return null;

  const isDelivered = order.status === 'DELIVERED';
  const isCancelled = order.status === 'CANCELLED';
  const isDisputed = order.status === 'DISPUTED';
  const currentStep = STATUS_INDEX[order.status] ?? 0;

  const canCancel = order.status === 'PLACED';
  const canDispute =
    order.status === 'OUT_FOR_DELIVERY' || (order.status === 'DELIVERED' && !isDisputed);

  const submit = async () => {
    if (reason.trim().length < 3) {
      setError('Please add a short reason (at least 3 characters).');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'cancel') await cancelOrder(order.id, reason.trim());
      if (mode === 'dispute') await disputeOrder(order.id, reason.trim());
      if (mode === 'ticket') {
        // The escalation path that exists after the 120s cancel window closes:
        // a real ticket the campus resolver can triage, not a dead-end toast.
        await api.post('/api/v1/support/tickets', {
          orderId: order.id,
          subject: `Issue with ${order.order_number}`,
          body: reason.trim(),
        });
        setNotice('Ticket raised. Campus support will follow up on this order.');
      }
      setMode('none');
      setReason('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title="Live Campus Delivery"
      subtitle={`${order.order_number} • from ${order.shop_name ?? 'merchant'}`}
      icon={<Bike className="w-5 h-5" />}
    >
      <div className="space-y-5">
        {!isDelivered && !isCancelled && !isDisputed ? (
          <div className="bg-gradient-to-r from-[#FFF5F4] to-[#FFECEB]/60 border-2 border-[#FF6161] rounded-3xl p-5 text-center">
            <div className="text-[11px] font-black text-[#FF6161] uppercase tracking-widest flex items-center justify-center gap-1.5 mb-1">
              <KeyRound className="w-4 h-4" /> Your Delivery PIN
            </div>
            <div className="text-4xl sm:text-5xl font-black text-[#1E1E24] tracking-widest my-1 font-mono">
              {order.delivery_pin ?? '••••'}
            </div>
            <p className="text-xs text-[#7E7E8B] max-w-xs mx-auto font-medium">
              Share this code with the delivery staff only when you receive your order. Never share
              it in advance.
            </p>
            <div className="pt-2">
              <button
                type="button"
                disabled={isRotatingPin}
                onClick={() => void handleRotatePin()}
                className="inline-flex items-center gap-1.5 text-[11px] font-black text-[#FF6161] hover:underline disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRotatingPin ? 'animate-spin' : ''}`} />
                <span>Snooped code? Rotate PIN</span>
              </button>
            </div>
          </div>
        ) : isDelivered ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
            <h4 className="font-black text-base text-emerald-900">Order Delivered</h4>
            <p className="text-xs text-emerald-700 mt-1">
              Handover was verified with your delivery PIN. Enjoy!
            </p>
          </div>
        ) : isDisputed ? (
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 text-center">
            <AlertCircle className="w-10 h-10 text-amber-600 mx-auto mb-2" />
            <h4 className="font-black text-base text-amber-900">Dispute Under Review</h4>
            <p className="text-xs text-amber-700 mt-1">
              Our campus support team will get back to you shortly.
            </p>
          </div>
        ) : (
          <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 text-center">
            <AlertCircle className="w-10 h-10 text-rose-600 mx-auto mb-2" />
            <h4 className="font-black text-base text-rose-900">Order Cancelled</h4>
            <p className="text-xs text-rose-700 mt-1">
              Reason: {order.cancellation_reason ?? 'Not provided'}
            </p>
          </div>
        )}

        {!isCancelled ? (
          <div className="bg-[#FAF6F4] border border-[#F2ECE9] rounded-2xl p-4">
            <div className="text-xs font-black text-[#1E1E24] uppercase tracking-wider mb-3">
              Delivery Timeline
            </div>
            <ol className="space-y-4">
              {STEPS.map((step, index) => {
                const isDone = index <= currentStep;
                const isCurrent = index === currentStep;
                return (
                  <li key={step.key} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                        isDone
                          ? 'bg-[#FF6161] text-white ring-4 ring-[#FFECEB]'
                          : 'bg-white border-2 border-[#E8DED9] text-[#7E7E8B]'
                      }`}
                    >
                      {isDone ? '✓' : index + 1}
                    </span>
                    <span>
                      <span
                        className={`block text-xs font-black ${
                          isCurrent ? 'text-[#FF6161]' : 'text-[#1E1E24]'
                        }`}
                      >
                        {step.label}
                        {isCurrent ? <span className="sr-only"> (current step)</span> : null}
                      </span>
                      <span className="block text-[11px] text-[#7E7E8B]">{step.desc}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        <div className="bg-white border border-[#F2ECE9] rounded-2xl p-3.5 flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#FAF6F4] flex items-center justify-center text-[#FF6161]">
            <MapPin className="w-4 h-4" />
          </span>
          <span>
            <span className="block text-[10px] text-[#7E7E8B] font-bold uppercase">
              Delivery Destination
            </span>
            <span className="block text-xs font-black text-[#1E1E24]">
              {order.address_summary ?? '—'}
            </span>
          </span>
        </div>

        <div className="border border-[#F2ECE9] rounded-2xl p-4 space-y-2">
          <div className="text-xs font-black text-[#1E1E24] uppercase tracking-wider mb-2">
            Order Items
          </div>
          {order.items?.map((item) => (
            <div key={item.id} className="flex justify-between text-xs">
              <span className="font-semibold text-[#1E1E24]">
                {item.quantity}× {item.item_name}
              </span>
              <span className="font-black text-[#FF6161]">₹{item.total_price}</span>
            </div>
          ))}
          <div className="pt-2 border-t border-[#F2ECE9] flex justify-between text-xs font-black text-[#1E1E24]">
            <span>Total ({order.payment?.payment_method?.replace(/_/g, ' ') ?? '—'})</span>
            <span>₹{order.total_amount}</span>
          </div>
        </div>

        {error ? <ErrorBanner message={error} /> : null}

        {notice ? (
          <p className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            {notice}
          </p>
        ) : null}

        {mode !== 'none' ? (
          <div className="border border-[#F2ECE9] rounded-2xl p-4 space-y-3 bg-[#FAF6F4]">
            <label htmlFor="order-reason" className="text-[11px] font-black uppercase tracking-wider text-[#1E1E24]">
              {mode === 'cancel' ? 'Why are you cancelling?' : 'What went wrong?'}
            </label>
            <textarea
              id="order-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder={
                mode === 'cancel'
                  ? 'e.g. Ordered by mistake'
                  : mode === 'ticket'
                    ? 'e.g. Order was never delivered and nobody answered the shop phone'
                    : 'e.g. Item was missing from the bag'
              }
              className="w-full p-3 rounded-xl bg-white border border-[#F2ECE9] text-xs font-medium focus:outline-none focus:border-[#FF6161]"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={isSubmitting}
                className="flex-1 bg-[#FF6161] hover:bg-[#EE4D4D] disabled:opacity-50 text-white py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {mode === 'cancel'
                  ? 'Confirm Cancellation'
                  : mode === 'ticket'
                    ? 'Raise Support Ticket'
                    : 'Submit Dispute'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('none');
                  setError(null);
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-bold border border-[#F2ECE9] bg-white"
              >
                Back
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 pt-4 border-t border-[#F2ECE9] flex items-center gap-3">
        <a
          href={`tel:${(order.customer_phone ?? '').replace(/\D/g, '')}`}
          className="flex-1 bg-white hover:bg-[#F2ECE9] border border-[#F2ECE9] text-[#1E1E24] py-2.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition"
        >
          <PhoneCall className="w-3.5 h-3.5 text-[#FF6161]" />
          <span>Call Merchant</span>
        </a>

        <button
          type="button"
          onClick={() => void refreshOrders()}
          className="px-4 py-2.5 rounded-2xl text-xs font-bold border border-[#F2ECE9] bg-white flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#FF6161]" />
          Refresh
        </button>

        {canCancel && mode === 'none' ? (
          <button
            type="button"
            onClick={() => setMode('cancel')}
            className="px-4 py-2.5 rounded-2xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition"
          >
            Cancel Order
          </button>
        ) : null}

        {canDispute && mode === 'none' ? (
          <button
            type="button"
            onClick={() => setMode('dispute')}
            className="px-4 py-2.5 rounded-2xl text-xs font-bold text-amber-700 hover:bg-amber-50 border border-amber-200 transition flex items-center gap-1.5"
          >
            <Clock className="w-3.5 h-3.5" />
            Report Issue
            <ChevronRight className="w-3 h-3" />
          </button>
        ) : null}

        {!isCancelled && mode === 'none' ? (
          <button
            type="button"
            onClick={() => setMode('ticket')}
            className="px-4 py-2.5 rounded-2xl text-xs font-bold text-[#1E1E24] hover:bg-[#FAF6F4] border border-[#F2ECE9] transition flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#FF6161]" />
            Get Help
          </button>
        ) : null}
      </div>

      <p className="mt-3 text-[10px] text-center text-[#7E7E8B] flex items-center justify-center gap-1">
        <ShieldCheck className="w-3 h-3 text-[#FF6161]" />
        Disputes are reviewed by campus support with the PIN verification log
      </p>
    </Modal>
  );
}
