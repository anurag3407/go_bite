'use client';

// components/dashboard/SupportDashboard.tsx
// Support console. The old version listed hardcoded tickets and its "Issue
// Instant Refund" button only fired an alert. It now works from real orders and
// exposes the one genuinely necessary support power: completing a delivery whose
// PIN is locked out, so a mistyped code cannot strand an order forever.
//
// All actions are written to the audit log server-side.

import React, { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api-client';
import { EmptyState, ErrorBanner, LogoLoader } from '@/components/ui/States';
import type { Order } from '@/lib/types';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Headphones,
  LifeBuoy,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

interface TicketRow {
  id: string;
  order_id: string | null;
  customer_id: string;
  subject: string;
  body: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'REJECTED';
  resolution_notes: string | null;
  created_at: string;
}

function isStale(order: Order): boolean {
  if (order.status !== 'OUT_FOR_DELIVERY') return false;
  const estimate = order.estimated_delivery_time ? new Date(order.estimated_delivery_time).getTime() : null;
  if (estimate === null) return false;
  // Flag anything well past its promised time.
  return Date.now() - estimate > 20 * 60 * 1000;
}

export function SupportDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [resolutions, setResolutions] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [orderData, ticketData] = await Promise.all([
        api.get<{ orders: Order[] }>('/api/v1/orders'),
        api.get<{ tickets: TicketRow[] }>('/api/v1/support/tickets'),
      ]);
      setOrders(orderData.orders);
      setTickets(ticketData.tickets);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    void Promise.resolve().then(async () => {
      if (isMounted) await load();
    });
    return () => {
      isMounted = false;
    };
  }, [load]);

  const openTickets = tickets.filter(
    (ticket) => ticket.status === 'OPEN' || ticket.status === 'INVESTIGATING',
  );

  const resolveTicket = async (ticket: TicketRow, status: 'INVESTIGATING' | 'RESOLVED' | 'REJECTED') => {
    const resolution = (resolutions[ticket.id] ?? '').trim();
    if (status !== 'INVESTIGATING' && resolution.length < 3) {
      setError('Record a short resolution note before closing a ticket.');
      return;
    }
    setBusyTicketId(ticket.id);
    setError(null);
    try {
      const data = await api.patch<{ ticket: TicketRow }>(`/api/v1/support/tickets/${ticket.id}`, {
        status,
        ...(resolution ? { resolution } : {}),
      });
      setTickets((current) => current.map((entry) => (entry.id === ticket.id ? data.ticket : entry)));
      setResolutions((current) => {
        const next = { ...current };
        delete next[ticket.id];
        return next;
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyTicketId(null);
    }
  };

  const attention = orders.filter(
    (order) => order.status === 'DISPUTED' || isStale(order),
  );

  const completeDelivery = async (order: Order) => {
    const note = (notes[order.id] ?? '').trim();
    if (note.length < 3) {
      setError('Record a short reason before completing a delivery manually.');
      return;
    }

    setBusyId(order.id);
    setError(null);
    try {
      const data = await api.post<{ order: Order }>(
        `/api/v1/support/orders/${order.id}/override`,
        { note },
      );
      setOrders((current) => current.map((entry) => (entry.id === order.id ? data.order : entry)));
      setNotes((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white border border-[#F2ECE9] rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
              <Headphones className="w-8 h-8 text-blue-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-[#1E1E24]">
                  Support &amp; Dispute Desk
                </h1>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                  Campus scoped
                </span>
              </div>
              <p className="text-xs text-[#7E7E8B] mt-0.5">
                Review disputes and unblock deliveries stuck on PIN verification
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1.5 text-xs font-bold text-[#1E1E24] bg-white border border-[#F2ECE9] hover:bg-[#FAF6F4] px-3 py-2 rounded-xl transition self-start"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#FF6161]" />
            Refresh queue
          </button>
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-black text-[#1E1E24]">Needs Attention</h2>
          <span className="bg-amber-100 text-amber-900 text-xs font-black px-2.5 py-0.5 rounded-full">
            {attention.length}
          </span>
        </div>

        {isLoading ? (
          <LogoLoader label="Loading support queue…" />
        ) : attention.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-8 h-8" />}
            title="Nothing needs attention"
            description="No disputes and no deliveries are overdue on this campus."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {attention.map((order) => {
              const isBusy = busyId === order.id;
              return (
                <article
                  key={order.id}
                  className="bg-white border border-[#F2ECE9] rounded-3xl p-5 shadow-sm space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-black text-[#FF6161]">{order.order_number}</span>
                      <h3 className="font-black text-sm text-[#1E1E24] truncate">
                        {order.customer_name ?? order.customer_id}
                      </h3>
                      <p className="text-xs text-[#7E7E8B] mt-0.5">{order.address_summary}</p>
                    </div>
                    <span
                      className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase shrink-0 ${
                        order.status === 'DISPUTED'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-rose-100 text-rose-900'
                      }`}
                    >
                      {order.status === 'DISPUTED' ? 'Disputed' : 'Overdue'}
                    </span>
                  </div>

                  <div className="bg-[#FAF6F4] rounded-2xl p-3 text-xs space-y-1">
                    <div className="flex justify-between font-semibold text-[#1E1E24]">
                      <span>Merchant</span>
                      <span>{order.shop_name ?? order.shop_id}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-[#1E1E24]">
                      <span>Total</span>
                      <span className="font-black text-[#FF6161]">₹{order.total_amount}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-[#1E1E24]">
                      <span>Placed</span>
                      <span className="flex items-center gap-1 text-[#7E7E8B]">
                        <Clock className="w-3 h-3" />
                        {new Date(order.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {order.status === 'DISPUTED' ? (
                    <p className="text-[11px] text-[#7E7E8B] bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                      Resolve with the merchant and student, then record the outcome in the audit
                      trail. Refund payouts are handled by the finance flow, not this console.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <label
                        htmlFor={`override-${order.id}`}
                        className="text-[11px] font-black uppercase tracking-wider text-[#1E1E24] flex items-center gap-1.5"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-[#FF6161]" />
                        Reason for manual completion
                      </label>
                      <input
                        id={`override-${order.id}`}
                        type="text"
                        value={notes[order.id] ?? ''}
                        onChange={(event) =>
                          setNotes((current) => ({ ...current, [order.id]: event.target.value }))
                        }
                        placeholder="e.g. Student confirmed handover on call; PIN locked"
                        className="w-full p-2.5 rounded-xl bg-white border border-[#F2ECE9] text-xs font-medium focus:outline-none focus:border-[#FF6161]"
                      />
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void completeDelivery(order)}
                        className="w-full bg-[#FF6161] hover:bg-[#EE4D4D] disabled:opacity-50 text-white py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-2"
                      >
                        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Mark Delivered (audited)
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-black text-[#1E1E24]">Student Tickets</h2>
          <span className="bg-blue-100 text-blue-900 text-xs font-black px-2.5 py-0.5 rounded-full">
            {openTickets.length}
          </span>
        </div>

        {isLoading ? (
          <LogoLoader label="Loading tickets…" />
        ) : openTickets.length === 0 ? (
          <EmptyState
            icon={<LifeBuoy className="w-8 h-8" />}
            title="No open tickets"
            description="Ticket escalations from students on this campus will appear here."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {openTickets.map((ticket) => {
              const isBusy = busyTicketId === ticket.id;
              return (
                <article
                  key={ticket.id}
                  className="bg-white border border-[#F2ECE9] rounded-3xl p-5 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-black text-sm text-[#1E1E24] truncate">{ticket.subject}</h3>
                      <p className="text-[11px] text-[#7E7E8B]">
                        {ticket.order_id ? `Order ${ticket.order_id}` : 'No order linked'} •{' '}
                        {new Date(ticket.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase shrink-0 ${
                        ticket.status === 'OPEN'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-blue-100 text-blue-900'
                      }`}
                    >
                      {ticket.status}
                    </span>
                  </div>

                  <p className="text-xs text-[#1E1E24] bg-[#FAF6F4] border border-[#F2ECE9] rounded-2xl p-3 whitespace-pre-wrap">
                    {ticket.body}
                  </p>

                  <input
                    type="text"
                    value={resolutions[ticket.id] ?? ''}
                    onChange={(event) =>
                      setResolutions((current) => ({ ...current, [ticket.id]: event.target.value }))
                    }
                    placeholder="Resolution note (required to close)"
                    aria-label={`Resolution note for ${ticket.subject}`}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#F2ECE9] text-xs font-medium focus:outline-none focus:border-[#FF6161]"
                  />

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isBusy || ticket.status === 'INVESTIGATING'}
                      onClick={() => void resolveTicket(ticket, 'INVESTIGATING')}
                      className="flex-1 bg-white border border-[#F2ECE9] hover:bg-[#FAF6F4] disabled:opacity-40 text-[#1E1E24] py-2.5 rounded-xl text-xs font-black transition"
                    >
                      Investigating
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void resolveTicket(ticket, 'RESOLVED')}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5"
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Resolve
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void resolveTicket(ticket, 'REJECTED')}
                      className="px-3 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50 py-2.5 rounded-xl text-xs font-black transition"
                    >
                      Reject
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
