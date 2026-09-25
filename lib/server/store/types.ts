// lib/server/store/types.ts
// Persistence contract for the platform. Two adapters implement it:
//   - memory.ts   : demo mode, seeded, zero credentials
//   - supabase.ts : real Postgres (Supabase) via the service-role client
// Route handlers only ever talk to this interface.

import type {
  Campus,
  CampusLocation,
  CatalogCategory,
  CatalogItem,
  Order,
  OrderStatus,
  Payment,
  Shop,
  User,
  UserRole,
} from '@/lib/types';

export interface OtpRecord {
  phone: string;
  otp_hash: string;
  expires_at: string;
  attempts: number;
  is_used: boolean;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface OrderStatusHistoryEntry {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_id: string | null;
  actor_role: UserRole | null;
  note?: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string;
  actor_role: UserRole;
  campus_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  ip_address?: string | null;
  created_at: string;
}

export interface CreateOrderInput {
  id: string;
  order_number: string;
  campus_id: string;
  shop_id: string;
  customer_id: string;
  address_id: string | null;
  address_summary: string;
  idempotency_key: string;
  status: OrderStatus;
  delivery_pin: string;
  items_subtotal: number;
  delivery_fee: number;
  platform_fee: number;
  tax_fee: number;
  total_amount: number;
  special_instructions?: string | null;
  estimated_delivery_time?: string | null;
  items: Array<{
    catalog_item_id: string;
    item_name: string;
    unit_price: number;
    quantity: number;
    total_price: number;
  }>;
  payment: {
    payment_method: Payment['payment_method'];
    status: Payment['status'];
    amount: number;
  };
}

export interface SupportTicketRow {
  id: string;
  order_id: string | null;
  customer_id: string;
  assigned_to: string | null;
  subject: string;
  body: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'REJECTED';
  resolution_notes: string | null;
  created_at: string;
}

export interface CreateTicketInput {
  order_id?: string | null;
  customer_id: string;
  subject: string;
  body: string;
}

export interface ShopDuesEntry {
  shopId: string;
  deliveredOrders: number;
  codCollected: number;
  platformFeesOwed: number;
  grossVolume: number;
  refundedOrders: number;
  refundedAmount: number;
}

export interface DataStore {
  /** True when this adapter persists beyond process lifetime. */
  readonly persistent: boolean;

  // ---- users -------------------------------------------------------------
  getUserById(id: string): Promise<User | null>;
  getUserByPhone(phone: string): Promise<User | null>;
  createUser(input: { name: string; phone: string; role: UserRole; active_campus_id: string | null }): Promise<User>;
  updateUser(id: string, patch: Partial<Pick<User, 'name' | 'role' | 'active_campus_id' | 'shop_id' | 'is_active' | 'phone_verified'>>): Promise<User>;

  // ---- otp ---------------------------------------------------------------
  saveOtp(record: OtpRecord): Promise<void>;
  getOtp(phone: string): Promise<OtpRecord | null>;
  incrementOtpAttempts(phone: string): Promise<number>;
  invalidateOtps(phone: string): Promise<void>;

  // ---- sessions ----------------------------------------------------------
  createSession(record: SessionRecord): Promise<void>;
  getSession(tokenHash: string): Promise<SessionRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;

  // ---- campuses ----------------------------------------------------------
  listCampuses(): Promise<Campus[]>;
  getCampus(id: string): Promise<Campus | null>;
  listCampusLocations(campusId: string): Promise<CampusLocation[]>;

  // ---- catalog -----------------------------------------------------------
  listShops(campusId: string): Promise<Shop[]>;
  getShop(id: string): Promise<Shop | null>;
  listCategories(shopId: string): Promise<CatalogCategory[]>;
  listItems(shopId: string): Promise<CatalogItem[]>;
  getItemsByIds(ids: string[]): Promise<CatalogItem[]>;
  setItemAvailability(shopId: string, itemId: string, isAvailable: boolean): Promise<CatalogItem | null>;
  setShopStatus(shopId: string, patch: { is_open?: boolean; is_snoozed?: boolean; snoozed_until?: string | null }): Promise<Shop | null>;
  updateShopProfile(shopId: string, patch: Partial<Pick<Shop, 'delivery_fee' | 'min_order_for_free_delivery' | 'prep_time_minutes' | 'upi_vpa'>>): Promise<Shop | null>;

  // ---- orders ------------------------------------------------------------
  createOrder(input: CreateOrderInput): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
  findOrderByIdempotencyKey(customerId: string, key: string): Promise<Order | null>;
  listOrdersByCustomer(customerId: string): Promise<Order[]>;
  listOrdersByShop(shopId: string, statuses?: OrderStatus[]): Promise<Order[]>;
  updateOrderStatus(id: string, status: OrderStatus, patch?: Partial<Pick<Order, 'delivered_at' | 'cancelled_at' | 'cancellation_reason' | 'estimated_delivery_time'>>): Promise<Order>;
  updateOrderPin(id: string, pin: string): Promise<Order | null>;
  appendStatusHistory(entry: Omit<OrderStatusHistoryEntry, 'id' | 'created_at'>): Promise<void>;
  getOrderHistory(orderId: string): Promise<OrderStatusHistoryEntry[]>;
  updatePaymentStatus(orderId: string, status: Payment['status'], transactionRef?: string): Promise<void>;

  // ---- support tickets ---------------------------------------------------
  createTicket(input: CreateTicketInput): Promise<SupportTicketRow>;
  listTickets(filter: { customerId?: string; campusId?: string; status?: string }): Promise<SupportTicketRow[]>;
  resolveTicket(
    ticketId: string,
    patch: { status: SupportTicketRow['status']; resolution_notes?: string | null; assigned_to?: string | null },
  ): Promise<SupportTicketRow | null>;

  // ---- admin -------------------------------------------------------------
  listOrdersByCampus(campusId: string, limit?: number): Promise<Order[]>;
  /** PLACED orders older than the timeout, for the expiry worker. */
  listStalePlacedOrders(olderThanIso: string, limit?: number): Promise<Order[]>;
  listAuditLogs(limit?: number): Promise<AuditLogEntry[]>;
  /** COD + platform-fee dues per shop, with refund reconciliation. */
  duesByCampus(campusId: string, sinceIso?: string): Promise<ShopDuesEntry[]>;

  // ---- audit -------------------------------------------------------------
  writeAudit(entry: Omit<AuditLogEntry, 'id' | 'created_at'>): Promise<void>;
}
