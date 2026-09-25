// lib/server/notify.ts
// Best-effort order SMS fan-out. The plan describes BullMQ + templates; this
// deployment has no worker, so without this file status changes are silent
// (shops miss PLACED orders, students stare at stale timelines).
//
// Contract: never throws, never blocks the order path. Callers use
// `void notifyOrder(...)` and move on; receipts are buffered in memory and
// mirrored to notification_logs when Supabase is configured.

import type { Order } from '@/lib/types';
import { dispatchOrderSms, maskPhone } from './sms';

export type OrderNotifyTemplate =
  | 'ORDER_PLACED_SHOP'
  | 'ORDER_ACCEPTED'
  | 'OUT_FOR_DELIVERY'
  | 'ORDER_CANCELLED';

export interface NotifyReceipt {
  template: OrderNotifyTemplate;
  userId: string | null;
  status: 'SENT' | 'FAILED';
  providerRef?: string;
  error?: string;
}

const receipts: NotifyReceipt[] = [];

/** Last-N receipts, surfaced by GET /admin/audit-logs for the pilot. */
export function recentNotifyReceipts(limit = 50): NotifyReceipt[] {
  return receipts.slice(-limit).reverse();
}

function templateText(template: OrderNotifyTemplate, order: Order): string {
  const items = String(order.items?.reduce((n, i) => n + i.quantity, 0) ?? 0);
  switch (template) {
    case 'ORDER_PLACED_SHOP':
      return `Go-Bite: new order ${order.order_number} (${items} items) Rs.${order.total_amount}. Accept in app.`;
    case 'ORDER_ACCEPTED':
      return `Go-Bite: ${order.order_number} accepted! ETA ~${order.estimated_delivery_time ?? 'soon'}. Track in app.`;
    case 'OUT_FOR_DELIVERY':
      return `Go-Bite: ${order.order_number} is out for delivery. Keep your in-app PIN ready (never share it over SMS/call).`;
    case 'ORDER_CANCELLED':
      return `Go-Bite: ${order.order_number} was cancelled (${order.cancellation_reason ?? 'by merchant'}).`;
  }
}

async function mirrorReceipt(
  userId: string | null,
  template: OrderNotifyTemplate,
  order: Order,
  status: 'SENT' | 'FAILED',
  providerRef?: string,
): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await client.from('notification_logs').insert({
      user_id: userId,
      channel: 'SMS',
      template,
      payload: { orderId: order.id, orderNumber: order.order_number },
      status,
      provider_ref: providerRef ?? null,
    });
  } catch {
    /* memory buffer already holds it; never fail the order path */
  }
}

/** Fire-and-forget order SMS. Never rejects. */
export async function notifyOrder(
  order: Order,
  template: OrderNotifyTemplate,
  to: { phone: string | null; userId: string | null },
): Promise<void> {
  if (!to.phone) {
    receipts.push({ template, userId: to.userId, status: 'FAILED', error: 'no-phone' });
    return;
  }
  try {
    const result = await dispatchOrderSms(to.phone, templateText(template, order));
    receipts.push({
      template,
      userId: to.userId,
      status: result.sent ? 'SENT' : 'FAILED',
      providerRef: result.providerRef,
      error: result.error,
    });
    if (receipts.length > 500) receipts.splice(0, receipts.length - 500);
    if (!result.sent) console.warn('[sms] order sms failed', { template, to: maskPhone(to.phone), error: result.error });
    void mirrorReceipt(to.userId, template, order, result.sent ? 'SENT' : 'FAILED', result.providerRef);
  } catch (error) {
    console.warn('[sms] order sms threw', { template, error });
    receipts.push({ template, userId: to.userId, status: 'FAILED', error: 'exception' });
  }
}

/** Customer phone for an order (user row wins, snapshot fallback). */
export async function orderCustomerPhone(order: Order): Promise<string | null> {
  try {
    const { getStore } = await import('./store');
    const user = await getStore().getUserById(order.customer_id);
    return user?.phone ?? order.customer_phone ?? null;
  } catch {
    return order.customer_phone ?? null;
  }
}
