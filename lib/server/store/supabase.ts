// lib/server/store/supabase.ts
// Real persistence adapter. Uses the service-role key, so it must only ever be
// imported by server code. Row shapes follow supabase/migrations/*.sql.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Campus,
  CampusLocation,
  CatalogCategory,
  CatalogItem,
  Order,
  OrderStatus,
  Shop,
  User,
  UserRole,
} from '@/lib/types';
import type {
  AuditLogEntry,
  CreateOrderInput,
  CreateTicketInput,
  DataStore,
  OrderStatusHistoryEntry,
  OtpRecord,
  SessionRecord,
  ShopDuesEntry,
  SupportTicketRow,
} from './types';

/** PostgREST returns numeric/decimal columns as strings; coerce for the API. */
const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));

function mapOrderRow(input: unknown): Order {
  const row = input as Record<string, unknown>;
  const items = (row.order_items as Array<Record<string, unknown>> | undefined) ?? [];
  const payments = (row.payments as Array<Record<string, unknown>> | undefined) ?? [];
  const payment = payments[0];

  return {
    id: String(row.id),
    order_number: String(row.order_number),
    campus_id: String(row.campus_id),
    shop_id: String(row.shop_id),
    customer_id: String(row.customer_id),
    address_id: (row.address_id as string) ?? undefined,
    address_summary: (row.address_summary as string) ?? undefined,
    status: row.status as OrderStatus,
    delivery_pin: String(row.delivery_pin ?? ''),
    items_subtotal: num(row.items_subtotal),
    delivery_fee: num(row.delivery_fee),
    platform_fee: num(row.platform_fee),
    tax_fee: num(row.tax_fee),
    total_amount: num(row.total_amount),
    special_instructions: (row.special_instructions as string) ?? undefined,
    estimated_delivery_time: (row.estimated_delivery_time as string) ?? undefined,
    created_at: String(row.created_at),
    delivered_at: (row.delivered_at as string) ?? undefined,
    cancelled_at: (row.cancelled_at as string) ?? undefined,
    cancellation_reason: (row.cancellation_reason as string) ?? undefined,
    items: items.map((item) => ({
      id: String(item.id),
      order_id: String(item.order_id),
      catalog_item_id: String(item.catalog_item_id),
      item_name: String(item.item_name),
      unit_price: num(item.unit_price),
      quantity: num(item.quantity),
      total_price: num(item.total_price),
    })),
    payment: payment
      ? {
          id: String(payment.id),
          order_id: String(payment.order_id),
          payment_method: payment.payment_method as Payment['payment_method'],
          status: payment.status as Payment['status'],
          transaction_ref: (payment.transaction_ref as string) ?? undefined,
          amount: num(payment.amount),
          created_at: String(payment.created_at),
        }
      : undefined,
  };
}

type Payment = NonNullable<Order['payment']>;

class SupabaseStore implements DataStore {
  readonly persistent = true;
  private client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private get db() {
    return this.client;
  }

  // ---- users -------------------------------------------------------------
  async getUserById(id: string): Promise<User | null> {
    const { data, error } = await this.db.from('users').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as User) ?? null;
  }

  async getUserByPhone(phone: string): Promise<User | null> {
    const { data, error } = await this.db.from('users').select('*').eq('phone', phone).maybeSingle();
    if (error) throw error;
    return (data as User) ?? null;
  }

  async createUser(input: { name: string; phone: string; role: UserRole; active_campus_id: string | null }): Promise<User> {
    const row = {
      id: `user-${crypto.randomUUID()}`,
      name: input.name,
      phone: input.phone,
      phone_verified: true,
      role: input.role,
      active_campus_id: input.active_campus_id,
      is_active: true,
    };
    const { data, error } = await this.db.from('users').insert(row).select('*').single();
    if (error) throw error;
    return data as User;
  }

  async updateUser(id: string, patch: Partial<User>): Promise<User> {
    const { data, error } = await this.db
      .from('users')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as User;
  }

  // ---- otp ---------------------------------------------------------------
  async saveOtp(record: OtpRecord): Promise<void> {
    // Single live OTP per phone: clear previous rows first.
    await this.db.from('otps').delete().eq('phone', record.phone);
    const { error } = await this.db.from('otps').insert({
      phone: record.phone,
      otp_hash: record.otp_hash,
      expires_at: record.expires_at,
      attempts: 0,
      is_used: false,
    });
    if (error) throw error;
  }

  async getOtp(phone: string): Promise<OtpRecord | null> {
    const { data, error } = await this.db
      .from('otps')
      .select('phone, otp_hash, expires_at, attempts, is_used')
      .eq('phone', phone)
      .eq('is_used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as OtpRecord) ?? null;
  }

  async incrementOtpAttempts(phone: string): Promise<number> {
    const record = await this.getOtp(phone);
    if (!record) return 0;
    const next = record.attempts + 1;
    await this.db.from('otps').update({ attempts: next }).eq('phone', phone).eq('is_used', false);
    return next;
  }

  async invalidateOtps(phone: string): Promise<void> {
    await this.db.from('otps').delete().eq('phone', phone);
  }

  // ---- sessions ----------------------------------------------------------
  async createSession(record: SessionRecord): Promise<void> {
    const { error } = await this.db.from('sessions').insert(record);
    if (error) throw error;
  }

  async getSession(tokenHash: string): Promise<SessionRecord | null> {
    const { data, error } = await this.db
      .from('sessions')
      .select('id, user_id, token_hash, expires_at, ip_address, user_agent')
      .eq('token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (error) throw error;
    return (data as SessionRecord) ?? null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.from('sessions').delete().eq('token_hash', tokenHash);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db.from('sessions').delete().eq('user_id', userId);
  }

  // ---- campuses ----------------------------------------------------------
  async listCampuses(): Promise<Campus[]> {
    const { data, error } = await this.db.from('campuses').select('*').eq('is_active', true);
    if (error) throw error;
    return (data ?? []) as Campus[];
  }

  async getCampus(id: string): Promise<Campus | null> {
    const { data, error } = await this.db.from('campuses').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as Campus) ?? null;
  }

  async listCampusLocations(campusId: string): Promise<CampusLocation[]> {
    const { data, error } = await this.db.from('campus_locations').select('*').eq('campus_id', campusId);
    if (error) throw error;
    return (data ?? []) as CampusLocation[];
  }

  // ---- catalog -----------------------------------------------------------
  async listShops(campusId: string): Promise<Shop[]> {
    const { data, error } = await this.db.from('shops').select('*').eq('campus_id', campusId);
    if (error) throw error;
    return (data ?? []) as Shop[];
  }

  async getShop(id: string): Promise<Shop | null> {
    const { data, error } = await this.db.from('shops').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as Shop) ?? null;
  }

  async listCategories(shopId: string): Promise<CatalogCategory[]> {
    const { data, error } = await this.db
      .from('catalog_categories')
      .select('*')
      .eq('shop_id', shopId)
      .order('display_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as CatalogCategory[];
  }

  async listItems(shopId: string): Promise<CatalogItem[]> {
    const { data, error } = await this.db.from('catalog_items').select('*').eq('shop_id', shopId);
    if (error) throw error;
    return (data ?? []) as CatalogItem[];
  }

  async getItemsByIds(ids: string[]): Promise<CatalogItem[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.db.from('catalog_items').select('*').in('id', ids);
    if (error) throw error;
    return (data ?? []) as CatalogItem[];
  }

  async setItemAvailability(shopId: string, itemId: string, isAvailable: boolean): Promise<CatalogItem | null> {
    const { data, error } = await this.db
      .from('catalog_items')
      .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('shop_id', shopId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return (data as CatalogItem) ?? null;
  }

  async setShopStatus(shopId: string, patch: { is_open?: boolean; is_snoozed?: boolean; snoozed_until?: string | null }): Promise<Shop | null> {
    const { data, error } = await this.db
      .from('shops')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', shopId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return (data as Shop) ?? null;
  }

  async updateShopProfile(shopId: string, patch: Partial<Shop>): Promise<Shop | null> {
    const { data, error } = await this.db
      .from('shops')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', shopId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return (data as Shop) ?? null;
  }

  // ---- orders ------------------------------------------------------------
  async createOrder(input: CreateOrderInput): Promise<Order> {
    const { error: orderError } = await this.db.from('orders').insert({
      id: input.id,
      order_number: input.order_number,
      campus_id: input.campus_id,
      shop_id: input.shop_id,
      customer_id: input.customer_id,
      address_id: input.address_id,
      address_summary: input.address_summary,
      idempotency_key: input.idempotency_key,
      status: input.status,
      delivery_pin: input.delivery_pin,
      items_subtotal: input.items_subtotal,
      delivery_fee: input.delivery_fee,
      platform_fee: input.platform_fee,
      tax_fee: input.tax_fee,
      total_amount: input.total_amount,
      special_instructions: input.special_instructions ?? null,
      estimated_delivery_time: input.estimated_delivery_time ?? null,
    });
    if (orderError) throw orderError;

    const { error: itemsError } = await this.db.from('order_items').insert(
      input.items.map((item) => ({ order_id: input.id, ...item })),
    );
    if (itemsError) throw itemsError;

    const payment = {
      id: `pay-${crypto.randomUUID()}`,
      order_id: input.id,
      payment_method: input.payment.payment_method,
      status: input.payment.status,
      amount: input.payment.amount,
    };
    const { error: paymentError } = await this.db.from('payments').insert(payment);
    if (paymentError) throw paymentError;

    const created = await this.getOrder(input.id);
    if (!created) throw new Error('Order insert succeeded but read-back failed');
    return created;
  }

  private orderSelect() {
    return '*, order_items(*), payments(*)';
  }

  async getOrder(id: string): Promise<Order | null> {
    const { data, error } = await this.db.from('orders').select(this.orderSelect()).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapOrderRow(data) : null;
  }

  async findOrderByIdempotencyKey(customerId: string, key: string): Promise<Order | null> {
    const { data, error } = await this.db
      .from('orders')
      .select(this.orderSelect())
      .eq('customer_id', customerId)
      .eq('idempotency_key', key)
      .maybeSingle();
    if (error) throw error;
    return data ? mapOrderRow(data) : null;
  }

  async listOrdersByCustomer(customerId: string): Promise<Order[]> {
    const { data, error } = await this.db
      .from('orders')
      .select(this.orderSelect())
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map((row) => mapOrderRow(row));
  }

  async listOrdersByShop(shopId: string, statuses?: OrderStatus[]): Promise<Order[]> {
    let query = this.db
      .from('orders')
      .select(this.orderSelect())
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (statuses && statuses.length > 0) query = query.in('status', statuses);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => mapOrderRow(row));
  }

  async updateOrderStatus(
    id: string,
    status: OrderStatus,
    patch?: Partial<Pick<Order, 'delivered_at' | 'cancelled_at' | 'cancellation_reason' | 'estimated_delivery_time'>>,
  ): Promise<Order> {
    const { error } = await this.db
      .from('orders')
      .update({ status, ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    const updated = await this.getOrder(id);
    if (!updated) throw new Error(`Order ${id} not found after update`);
    return updated;
  }

  async updateOrderPin(id: string, pin: string): Promise<Order | null> {
    const { error } = await this.db
      .from('orders')
      .update({ delivery_pin: pin, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return this.getOrder(id);
  }

  async appendStatusHistory(entry: Omit<OrderStatusHistoryEntry, 'id' | 'created_at'>): Promise<void> {
    const { error } = await this.db.from('order_status_history').insert(entry);
    if (error) throw error;
  }

  async getOrderHistory(orderId: string): Promise<OrderStatusHistoryEntry[]> {
    const { data, error } = await this.db
      .from('order_status_history')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as OrderStatusHistoryEntry[];
  }

  async updatePaymentStatus(orderId: string, status: Payment['status'], transactionRef?: string): Promise<void> {
    const { error } = await this.db
      .from('payments')
      .update({ status, ...(transactionRef ? { transaction_ref: transactionRef } : {}), updated_at: new Date().toISOString() })
      .eq('order_id', orderId);
    if (error) throw error;
  }
  // ---- support tickets ---------------------------------------------------
  async createTicket(input: CreateTicketInput): Promise<SupportTicketRow> {
    const { data, error } = await this.db
      .from('support_tickets')
      .insert({
        order_id: input.order_id ?? null,
        customer_id: input.customer_id,
        subject: input.subject,
        body: input.body,
        status: 'OPEN',
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as SupportTicketRow;
  }

  async listTickets(filter: { customerId?: string; campusId?: string; status?: string }): Promise<SupportTicketRow[]> {
    let query = this.db.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(100);
    if (filter.customerId) query = query.eq('customer_id', filter.customerId);
    if (filter.status) query = query.eq('status', filter.status);
    const { data, error } = await query;
    if (error) throw error;
    let rows = (data ?? []) as SupportTicketRow[];
    if (filter.campusId) {
      const orderIds = rows.map((t) => t.order_id).filter((id): id is string => Boolean(id));
      if (orderIds.length > 0) {
        const { data: orders } = await this.db.from('orders').select('id, campus_id').in('id', orderIds);
        const campusByOrder = new Map((orders ?? []).map((o) => [String(o.id), String(o.campus_id)]));
        rows = rows.filter((t) => !t.order_id || campusByOrder.get(t.order_id) === filter.campusId);
      }
    }
    return rows;
  }

  async resolveTicket(
    ticketId: string,
    patch: { status: SupportTicketRow['status']; resolution_notes?: string | null; assigned_to?: string | null },
  ): Promise<SupportTicketRow | null> {
    const { data, error } = await this.db
      .from('support_tickets')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', ticketId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return (data as SupportTicketRow) ?? null;
  }

  // ---- admin -------------------------------------------------------------
  async listOrdersByCampus(campusId: string, limit = 100): Promise<Order[]> {
    const { data, error } = await this.db
      .from('orders')
      .select(this.orderSelect())
      .eq('campus_id', campusId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => mapOrderRow(row));
  }

  async listStalePlacedOrders(olderThanIso: string, limit = 100): Promise<Order[]> {
    const { data, error } = await this.db
      .from('orders')
      .select(this.orderSelect())
      .eq('status', 'PLACED')
      .lt('created_at', olderThanIso)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => mapOrderRow(row));
  }

  async listAuditLogs(limit = 100): Promise<AuditLogEntry[]> {
    const { data, error } = await this.db
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as AuditLogEntry[];
  }

  async duesByCampus(
    campusId: string,
    sinceIso?: string,
  ): Promise<ShopDuesEntry[]> {
    let query = this.db
      .from('orders')
      .select('shop_id, total_amount, platform_fee, status, created_at, payments(payment_method, status)')
      .eq('campus_id', campusId)
      .in('status', ['DELIVERED', 'DISPUTED', 'CANCELLED']);
    if (sinceIso) query = query.gte('created_at', sinceIso);
    const { data, error } = await query.limit(2000);
    if (error) throw error;
    const byShop = new Map<string, ShopDuesEntry>();
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const payments = (row.payments as Array<Record<string, unknown>> | undefined) ?? [];
      const payment = payments[0];
      if (payment?.payment_method !== 'CASH_ON_DELIVERY') continue;
      const shopId = String(row.shop_id);
      const status = String(row.status);
      const paymentStatus = payment.status ? String(payment.status) : '';
      const entry = byShop.get(shopId) ?? {
        shopId,
        deliveredOrders: 0,
        codCollected: 0,
        platformFeesOwed: 0,
        grossVolume: 0,
        refundedOrders: 0,
        refundedAmount: 0,
      };

      if ((status === 'DELIVERED' || status === 'DISPUTED') && paymentStatus === 'CAPTURED') {
        entry.deliveredOrders += 1;
        entry.codCollected += num(row.total_amount);
        entry.platformFeesOwed += num(row.platform_fee);
        entry.grossVolume += num(row.total_amount);
      } else if (paymentStatus === 'REFUNDED') {
        entry.refundedOrders += 1;
        entry.refundedAmount += num(row.total_amount);
      }
      byShop.set(shopId, entry);
    }
    return [...byShop.values()];
  }


  // ---- audit -------------------------------------------------------------
  async writeAudit(entry: Omit<AuditLogEntry, 'id' | 'created_at'>): Promise<void> {
    const { error } = await this.db.from('audit_logs').insert(entry);
    // Audit failures must never break the main flow, but must be visible.
    if (error) console.error('[audit] failed to persist audit log', error);
  }
}

export function createSupabaseStore(url: string, serviceRoleKey: string): SupabaseStore {
  return new SupabaseStore(url, serviceRoleKey);
}
