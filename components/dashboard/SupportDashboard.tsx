'use client';

import React, { useState } from 'react';
import { useCart } from '@/lib/store/cart-context';
import { 
  Headphones, 
  AlertCircle, 
  CheckCircle2, 
  KeyRound, 
  RotateCcw, 
  Search,
  Clock,
  ShieldAlert
} from 'lucide-react';

export function SupportDashboard() {
  const { orders } = useCart();
  const [resolvedIds, setResolvedIds] = useState<string[]>([]);

  const mockTickets = [
    {
      id: 'tick-1',
      order_number: 'GB-YUM-10492',
      student_name: 'Rahul Sharma (Chanakya Hostel)',
      phone: '9876543110',
      issue: 'Canteen delivery boy took 35 mins; fries were cold.',
      amount: 243,
      status: 'OPEN',
      pin_verified: true,
      delivered_at: '18 mins ago',
    },
    {
      id: 'tick-2',
      order_number: 'GB-NES-10491',
      student_name: 'Priya Verma (Gargi Hostel)',
      phone: '9876543112',
      issue: 'Cold coffee was missing extra chocolate syrup.',
      amount: 60,
      status: 'OPEN',
      pin_verified: true,
      delivered_at: '2 hours ago',
    },
  ];

  const handleRefund = (ticketId: string) => {
    alert(`Refund of ₹60 initiated via direct UPI reconciliation to student!`);
    setResolvedIds((prev) => [...prev, ticketId]);
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Top Banner */}
      <div className="bg-white border border-[#F1E9E4] rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-700">
            <Headphones className="w-8 h-8 text-blue-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-[#391713]">Query Resolver & Dispute Center</h1>
              <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                Support Agent
              </span>
            </div>
            <p className="text-xs text-[#7A6A65] mt-0.5">
              Inspect PIN Verification Logs, Handle Student Tickets & Trigger UPI Refunds
            </p>
          </div>
        </div>
      </div>

      {/* Tickets List */}
      <div className="bg-white border border-[#F1E9E4] rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-[#391713]">Open Campus Tickets</h2>
          <span className="bg-rose-100 text-rose-800 text-xs font-black px-2.5 py-0.5 rounded-full">
            {mockTickets.filter((t) => !resolvedIds.includes(t.id)).length} Pending
          </span>
        </div>

        <div className="space-y-4">
          {mockTickets.map((ticket) => {
            const isResolved = resolvedIds.includes(ticket.id);
            return (
              <div
                key={ticket.id}
                className={`p-5 rounded-2xl border transition ${
                  isResolved ? 'bg-emerald-50/40 border-emerald-200 opacity-60' : 'bg-[#FAF7F5] border-[#F1E9E4]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-[#E95322]">{ticket.order_number}</span>
                    <span className="font-bold text-sm text-[#391713]">{ticket.student_name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1">
                      <KeyRound className="w-3 h-3" /> PIN Verified by Staff
                    </span>
                    <span className="text-xs font-black text-[#391713]">₹{ticket.amount}</span>
                  </div>
                </div>

                <p className="text-xs text-[#7A6A65] bg-white p-3 rounded-xl border border-[#F1E9E4]">
                  <strong className="text-[#391713]">Student Complaint:</strong> {ticket.issue}
                </p>

                <div className="mt-3 pt-3 border-t border-[#F1E9E4] flex items-center justify-between">
                  <div className="text-[11px] text-[#7A6A65] flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Delivered {ticket.delivered_at}
                  </div>

                  {isResolved ? (
                    <span className="text-xs font-black text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Refund Dispatched
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRefund(ticket.id)}
                        className="bg-[#E95322] hover:bg-[#D44213] text-white px-3.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Issue Instant Refund</span>
                      </button>
                      <button
                        onClick={() => setResolvedIds([...resolvedIds, ticket.id])}
                        className="bg-white border border-[#F1E9E4] hover:bg-[#FAF7F5] text-[#391713] px-3.5 py-1.5 rounded-xl text-xs font-bold transition"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
