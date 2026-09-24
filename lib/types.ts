// lib/types.ts - Core types for Go-Bite platform

export type UserRole = 
  | 'SUPER_ADMIN' 
  | 'CAMPUS_ADMIN' 
  | 'CONFIG_CHANGER' 
  | 'QUERY_RESOLVER' 
  | 'SHOP_OWNER' 
  | 'SHOP_STAFF' 
  | 'CUSTOMER';

export type ServiceType = 
  | 'FOOD_DINING'
  | 'SALON_GROOMING'
  | 'LAUNDRY'
  | 'PRINT_STATIONERY'
  | 'CAMPUS_STORE';

export type OrderStatus = 
  | 'PLACED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'DISPUTED';

export type PaymentMethod = 
  | 'UPI_INTENT'
  | 'GATEWAY_ONLINE'
  | 'CASH_ON_DELIVERY'
  | 'CAMPUS_WALLET';

export type PaymentStatus = 
  | 'PENDING'
  | 'CAPTURED'
  | 'FAILED'
  | 'REFUNDED';

export type DropLocationType = 
  | 'BOYS_HOSTEL'
  | 'GIRLS_HOSTEL'
  | 'ACADEMIC_BLOCK'
  | 'CAMPUS_GATE'
  | 'FACULTY_QUARTERS'
  | 'LIBRARY';

export interface Campus {
  id: string;
  name: string;
  slug: string;
  code: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  is_active: boolean;
  tagline?: string;
  image_url?: string;
}

export interface CampusLocation {
  id: string;
  campus_id: string;
  name: string;
  type: DropLocationType;
  delivery_allowed_at_door: boolean;
}

export interface CustomerAddress {
  id: string;
  user_id: string;
  campus_location_id: string;
  location_name?: string;
  location_type?: DropLocationType;
  room_or_flat: string;
  landmark?: string;
  alternate_phone?: string;
  is_default: boolean;
}

export interface Shop {
  id: string;
  campus_id: string;
  name: string;
  slug: string;
  service_type: ServiceType;
  image_url: string;
  description: string;
  is_open: boolean;
  is_snoozed: boolean;
  snoozed_until?: string | null;
  delivery_enabled: boolean;
  delivery_fee: number;
  min_order_for_free_delivery?: number | null;
  prep_time_minutes: number;
  upi_vpa?: string;
  phone: string;
  rating: number;
  tags?: string[];
  banner_text?: string;
}

export interface CatalogCategory {
  id: string;
  shop_id: string;
  name: string;
  display_order: number;
}

export interface CatalogItem {
  id: string;
  shop_id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  discounted_price?: number | null;
  image_url: string;
  is_veg: boolean;
  is_available: boolean;
  duration_minutes?: number | null; // For salon services
  bestseller?: boolean;
}

export interface OrderItem {
  id: string;
  order_id: string;
  catalog_item_id: string;
  item_name: string;
  unit_price: number;
  quantity: number;
  total_price: number;
}

export interface Order {
  id: string;
  order_number: string;
  campus_id: string;
  campus_name?: string;
  shop_id: string;
  shop_name?: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  address_id?: string;
  address_summary?: string;
  status: OrderStatus;
  delivery_pin: string; // 4-digit PIN given to customer
  items_subtotal: number;
  delivery_fee: number;
  platform_fee: number;
  tax_fee: number;
  total_amount: number;
  special_instructions?: string;
  estimated_delivery_time?: string;
  created_at: string;
  delivered_at?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  items?: OrderItem[];
  payment?: Payment;
}

export interface Payment {
  id: string;
  order_id: string;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  transaction_ref?: string;
  amount: number;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  order_id: string;
  order_number?: string;
  customer_id: string;
  customer_name?: string;
  assigned_to?: string;
  subject: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'REJECTED';
  resolution_notes?: string;
  created_at: string;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  phone: string;
  phone_verified: boolean;
  role: UserRole;
  active_campus_id?: string;
  shop_id?: string;
  is_active: boolean;
}

export interface CartItem {
  item: CatalogItem;
  quantity: number;
}

export interface CartState {
  shopId: string | null;
  shopName: string | null;
  items: CartItem[];
  specialInstructions: string;
}
