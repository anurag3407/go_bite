// lib/server/store/memory.ts
// Demo-mode adapter. Holds everything in process memory, seeded from the
// catalogue in lib/mock-data.ts so the pilot is fully usable without any
// external credentials. Data does not survive a restart — by design, and
// surfaced by /api/health/ready.

import {
  MOCK_CAMPUSES,
  MOCK_CAMPUS_LOCATIONS,
  MOCK_CATEGORIES,
  MOCK_ITEMS,
  MOCK_SHOPS,
} from '@/lib/mock-data';
import type {
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

const clone = <T>(value: T): T => structuredClone(value);

const DEMO_USERS: User[] = [
  {
    id: 'user-student-1',
    name: 'Anurag Mishra',
    phone: '9876543299',
    email: 'anurag@campus.edu',
    phone_verified: true,
    role: 'CUSTOMER',
    active_campus_id: 'campus-iitp-bihta',
    is_active: true,
  },
  {
    id: 'user-shop-1',
    name: 'YumQuick Kitchen',
    phone: '9876543210',
    phone_verified: true,
    role: 'SHOP_OWNER',
    active_campus_id: 'campus-iitp-bihta',
    shop_id: 'shop-yumquick',
    is_active: true,
  },
  {
    id: 'user-admin-1',
    name: 'Platform Admin',
    phone: '9876500001',
    phone_verified: true,
    role: 'SUPER_ADMIN',
    active_campus_id: 'campus-iitp-bihta',
    is_active: true,
  },
  {
    id: 'user-support-1',
    name: 'Campus Support',
    phone: '9876500002',
    phone_verified: true,
    role: 'QUERY_RESOLVER',
    active_campus_id: 'campus-iitp-bihta',
    is_active: true,
  },
];

export class MemoryStore implements DataStore {
  readonly persistent = false;

  private users = new Map<string, User>(DEMO_USERS.map((u) => [u.id, clone(u)]));
  private otps = new Map<string, OtpRecord>();
  private sessions = new Map<string, SessionRecord>();
  private orders = new Map<string, Order>();
  private orderItems = new Map<string, NonNullable<Order['items']>>();
  private idempotencyIndex = new Map<string, string>();
  private history: OrderStatusHistoryEntry[] = [];
  private audits: AuditLogEntry[] = [];
  private shops = new Map<string, Shop>(MOCK_SHOPS.map((s) => [s.id, clone(s)]));
  private items = new Map<string, CatalogItem>(MOCK_ITEMS.map((i) => [i.id, clone(i)]));

  // ---- users -------------------------------------------------------------
  async getUserById(id: string) {
    const user = this.users.get(id);
    return user ? clone(user) : null;
  }

  async getUserByPhone(phone: string) {
    for (const user of this.users.values()) {
      if (user.phone === phone) return clone(user);
    }
    return null;
  }

  async createUser(input: { name: string; phone: string; role: UserRole; active_campus_id: string | null }) {
    const user: User = {
      id: `user-${crypto.randomUUID()}`,
      name: input.name,
      phone: input.phone,
      phone_verified: true,
      role: input.role,
      active_campus_id: input.active_campus_id ?? undefined,
      is_active: true,
    };
    this.users.set(user.id, user);
    return clone(user);
  }

  async updateUser(id: string, patch: Partial<User>) {
    const existing = this.users.get(id);
    if (!existing) throw new Error(`User ${id} not found`);
    const updated = { ...existing, ...patch, id: existing.id };
    this.users.set(id, updated);
    return clone(updated);
  }

  // ---- otp ---------------------------------------------------------------
  async saveOtp(record: OtpRecord) {
    this.otps.set(record.phone, clone(record));
  }

  async getOtp(phone: string) {
    const record = this.otps.get(phone);
    return record ? clone(record) : null;
  }

  async incrementOtpAttempts(phone: string) {
    const record = this.otps.get(phone);
    if (!record) return 0;
    record.attempts += 1;
    return record.attempts;
  }

  async invalidateOtps(phone: string) {
    this.otps.delete(phone);
  }

  // ---- sessions ----------------------------------------------------------
  async createSession(record: SessionRecord) {
    this.sessions.set(record.token_hash, clone(record));
  }

  async getSession(tokenHash: string) {
    const record = this.sessions.get(tokenHash);
    if (!record) return null;
    if (new Date(record.expires_at).getTime() <= Date.now()) {
      this.sessions.delete(tokenHash);
      return null;
    }
    return clone(record);
  }

  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }

  async deleteUserSessions(userId: string) {
    for (const [hash, session] of this.sessions) {
      if (session.user_id === userId) this.sessions.delete(hash);
    }
  }

  // ---- campuses ----------------------------------------------------------
  async listCampuses() {
    return clone(MOCK_CAMPUSES.filter((c) => c.is_active));
  }

  async getCampus(id: string) {
    const campus = MOCK_CAMPUSES.find((c) => c.id === id);
    return campus ? clone(campus) : null;
  }

  async listCampusLocations(campusId: string): Promise<CampusLocation[]> {
    return clone(MOCK_CAMPUS_LOCATIONS.filter((l) => l.campus_id === campusId));
  }

  // ---- catalog -----------------------------------------------------------
  async listShops(campusId: string) {
    return clone([...this.shops.values()].filter((s) => s.campus_id === campusId));
  }

  async getShop(id: string) {
    const shop = this.shops.get(id);
    return shop ? clone(shop) : null;
  }

  async listCategories(shopId: string): Promise<CatalogCategory[]> {
    return clone(MOCK_CATEGORIES.filter((c) => c.shop_id === shopId));
  }

  async listItems(shopId: string) {
    return clone([...this.items.values()].filter((i) => i.shop_id === shopId));
  }

  async getItemsByIds(ids: string[]) {
    return clone(ids.map((id) => this.items.get(id)).filter((i): i is CatalogItem => Boolean(i)));
  }

  async setItemAvailability(shopId: string, itemId: string, isAvailable: boolean) {
    const item = this.items.get(itemId);
    if (!item || item.shop_id !== shopId) return null;
    const updated = { ...item, is_available: isAvailable };
    this.items.set(itemId, updated);
    return clone(updated);
  }

  async setShopStatus(shopId: string, patch: { is_open?: boolean; is_snoozed?: boolean; snoozed_until?: string | null }) {
    const shop = this.shops.get(shopId);
    if (!shop) return null;
    const updated = { ...shop, ...patch };
    this.shops.set(shopId, updated);
    return clone(updated);
  }

  async updateShopProfile(shopId: string, patch: Partial<Shop>) {
    const shop = this.shops.get(shopId);
    if (!shop) return null;
    const updated = { ...shop, ...patch };
    this.shops.set(shopId, updated);
    return clone(updated);
  }

  // ---- orders ------------------------------------------------------------
  async createOrder(input: CreateOrderInput): Promise<Order> {
    const order: Order = {
      id: input.id,
      order_number: input.order_number,
      campus_id: input.campus_id,
      shop_id: input.shop_id,
      customer_id: input.customer_id,
      address_id: input.address_id ?? undefined,
      address_summary: input.address_summary,
      status: input.status,
      delivery_pin: input.delivery_pin,
      items_subtotal: input.items_subtotal,
      delivery_fee: input.delivery_fee,
      platform_fee: input.platform_fee,
      tax_fee: input.tax_fee,
      total_amount: input.total_amount,
      special_instructions: input.special_instructions ?? undefined,
      estimated_delivery_time: input.estimated_delivery_time ?? undefined,
      created_at: new Date().toISOString(),
      payment: {
        id: `pay-${crypto.randomUUID()}`,
        order_id: input.id,
        payment_method: input.payment.payment_method,
        status: input.payment.status,
        amount: input.payment.amount,
        created_at: new Date().toISOString(),
      },
    };
    this.orders.set(order.id, order);
    this.idempotencyIndex.set(`${input.customer_id}:${input.idempotency_key}`, order.id);
    this.orderItems.set(
      order.id,
      input.items.map((item, index) => ({
        id: `${order.id}-oi-${index}`,
        order_id: order.id,
        ...item,
      })),
    );
    return this.withItems(clone(order));
  }

  private withItems(order: Order): Order {
    return { ...order, items: clone(this.orderItems.get(order.id) ?? []) };
  }

  async getOrder(id: string) {
    const order = this.orders.get(id);
    return order ? this.withItems(clone(order)) : null;
  }

  async findOrderByIdempotencyKey(customerId: string, key: string) {
    const orderId = this.idempotencyIndex.get(`${customerId}:${key}`);
    if (!orderId) return null;
    const order = this.orders.get(orderId);
    return order ? this.withItems(clone(order)) : null;
  }

  async listOrdersByCustomer(customerId: string) {
    return [...this.orders.values()]
      .filter((o) => o.customer_id === customerId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((o) => this.withItems(clone(o)));
  }

  async listOrdersByShop(shopId: string, statuses?: OrderStatus[]) {
    return [...this.orders.values()]
      .filter((o) => o.shop_id === shopId && (!statuses || statuses.includes(o.status)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((o) => this.withItems(clone(o)));
  }

  async updateOrderStatus(id: string, status: OrderStatus, patch?: Partial<Order>) {
    const order = this.orders.get(id);
    if (!order) throw new Error(`Order ${id} not found`);
    const updated: Order = { ...order, status, ...patch };
    this.orders.set(id, updated);
    return this.withItems(clone(updated));
  }

  async updateOrderPin(id: string, pin: string): Promise<Order | null> {
    const order = this.orders.get(id);
    if (!order) return null;
    order.delivery_pin = pin;
    return this.withItems(clone(order));
  }

  async appendStatusHistory(entry: Omit<OrderStatusHistoryEntry, 'id' | 'created_at'>) {
    this.history.push({
      ...entry,
      id: `osh-${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
    });
  }

  async getOrderHistory(orderId: string) {
    return clone(this.history.filter((h) => h.order_id === orderId));
  }

  async updatePaymentStatus(orderId: string, status: 'PENDING' | 'CAPTURED' | 'FAILED' | 'REFUNDED', transactionRef?: string) {
    const order = this.orders.get(orderId);
    if (!order?.payment) return;
    order.payment = { ...order.payment, status, transaction_ref: transactionRef ?? order.payment.transaction_ref };
    this.orders.set(orderId, order);
  }

  // ---- audit -------------------------------------------------------------
  async writeAudit(entry: Omit<AuditLogEntry, 'id' | 'created_at'>) {
    this.audits.push({
      ...entry,
      id: `aud-${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
    });
  }

  // ---- support tickets ---------------------------------------------------
  private tickets = new Map<string, SupportTicketRow>();

  async createTicket(input: CreateTicketInput): Promise<SupportTicketRow> {
    const ticket: SupportTicketRow = {
      id: `tkt-${crypto.randomUUID()}`,
      order_id: input.order_id ?? null,
      customer_id: input.customer_id,
      assigned_to: null,
      subject: input.subject,
      body: input.body,
      status: 'OPEN',
      resolution_notes: null,
      created_at: new Date().toISOString(),
    };
    this.tickets.set(ticket.id, ticket);
    return clone(ticket);
  }

  async listTickets(filter: { customerId?: string; campusId?: string; status?: string }): Promise<SupportTicketRow[]> {
    let rows = [...this.tickets.values()];
    if (filter.customerId) rows = rows.filter((t) => t.customer_id === filter.customerId);
    if (filter.status) rows = rows.filter((t) => t.status === filter.status);
    if (filter.campusId) {
      const orderCampus = new Map<string, string>();
      for (const order of this.orders.values()) orderCampus.set(order.id, order.campus_id);
      rows = rows.filter((t) => !t.order_id || orderCampus.get(t.order_id) === filter.campusId);
    }
    return clone(rows.sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }

  async resolveTicket(
    ticketId: string,
    patch: { status: SupportTicketRow['status']; resolution_notes?: string | null; assigned_to?: string | null },
  ): Promise<SupportTicketRow | null> {
    const existing = this.tickets.get(ticketId);
    if (!existing) return null;
    const updated: SupportTicketRow = {
      ...existing,
      status: patch.status,
      resolution_notes: patch.resolution_notes ?? existing.resolution_notes,
      assigned_to: patch.assigned_to ?? existing.assigned_to,
    };
    this.tickets.set(ticketId, updated);
    return clone(updated);
  }

  // ---- admin -------------------------------------------------------------
  async listOrdersByCampus(campusId: string, limit = 100): Promise<Order[]> {
    return [...this.orders.values()]
      .filter((o) => o.campus_id === campusId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((o) => this.withItems(clone(o)));
  }

  async listStalePlacedOrders(olderThanIso: string, limit = 100): Promise<Order[]> {
    return [...this.orders.values()]
      .filter((o) => o.status === 'PLACED' && o.created_at < olderThanIso)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, limit)
      .map((o) => this.withItems(clone(o)));
  }

  async listAuditLogs(limit = 100): Promise<AuditLogEntry[]> {
    return clone([...this.audits].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit));
  }

  async duesByCampus(
    campusId: string,
    sinceIso?: string,
  ): Promise<ShopDuesEntry[]> {
    const byShop = new Map<string, ShopDuesEntry>();
    for (const order of this.orders.values()) {
      if (order.campus_id !== campusId) continue;
      if (sinceIso && order.created_at < sinceIso) continue;
      // Only COD moves physical cash at the counter
      if (order.payment?.payment_method !== 'CASH_ON_DELIVERY') continue;

      const entry = byShop.get(order.shop_id) ?? {
        shopId: order.shop_id,
        deliveredOrders: 0,
        codCollected: 0,
        platformFeesOwed: 0,
        grossVolume: 0,
        refundedOrders: 0,
        refundedAmount: 0,
      };

      if ((order.status === 'DELIVERED' || order.status === 'DISPUTED') && order.payment?.status === 'CAPTURED') {
        entry.deliveredOrders += 1;
        entry.codCollected += order.total_amount;
        entry.platformFeesOwed += order.platform_fee;
        entry.grossVolume += order.total_amount;
      } else if (order.payment?.status === 'REFUNDED') {
        entry.refundedOrders += 1;
        entry.refundedAmount += order.total_amount;
      }

      byShop.set(order.shop_id, entry);
    }
    return [...byShop.values()];
  }
}

const globalForStore = globalThis as unknown as { __gobiteMemoryStore?: MemoryStore };
export const memoryStore: MemoryStore = globalForStore.__gobiteMemoryStore ?? new MemoryStore();
if (!globalForStore.__gobiteMemoryStore) globalForStore.__gobiteMemoryStore = memoryStore;
