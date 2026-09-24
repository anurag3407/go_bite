-- Go-Bite: Multi-Campus Hyperlocal Delivery & Concierge Platform
-- Initial Schema Migration for Self-Hosted Supabase PostgreSQL

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. ENUMS
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'SUPER_ADMIN', 
    'CAMPUS_ADMIN', 
    'CONFIG_CHANGER', 
    'QUERY_RESOLVER', 
    'SHOP_OWNER', 
    'SHOP_STAFF', 
    'CUSTOMER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE service_type AS ENUM (
    'FOOD_DINING',
    'SALON_GROOMING',
    'LAUNDRY',
    'PRINT_STATIONERY',
    'CAMPUS_STORE'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'PLACED',
    'ACCEPTED',
    'PREPARING',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
    'DISPUTED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM (
    'PENDING',
    'CAPTURED',
    'FAILED',
    'REFUNDED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM (
    'UPI_INTENT',
    'GATEWAY_ONLINE',
    'CASH_ON_DELIVERY',
    'CAMPUS_WALLET'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE drop_location_type AS ENUM (
    'BOYS_HOSTEL',
    'GIRLS_HOSTEL',
    'ACADEMIC_BLOCK',
    'CAMPUS_GATE',
    'FACULTY_QUARTERS',
    'LIBRARY'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. CORE GEOGRAPHY & CAMPUSES
CREATE TABLE IF NOT EXISTS campuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  code VARCHAR(20) UNIQUE NOT NULL, -- e.g. IITP-BIHTA, IITK, NITP
  center_lat DECIMAL(10, 8) NOT NULL,
  center_lng DECIMAL(11, 8) NOT NULL,
  radius_meters INT DEFAULT 4000,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. BETTER AUTH COMPLIANT USER & AUTH TABLES
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone VARCHAR(15) UNIQUE NOT NULL,
  phone_verified BOOLEAN DEFAULT false,
  role user_role DEFAULT 'CUSTOMER',
  active_campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL,
  shop_id UUID,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(15) NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT DEFAULT 0,
  is_used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CAMPUS HOSTELS / ADDRESS DIRECTORY
CREATE TABLE IF NOT EXISTS campus_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  type drop_location_type NOT NULL,
  delivery_allowed_at_door BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campus_location_id UUID REFERENCES campus_locations(id) ON DELETE SET NULL,
  room_or_flat VARCHAR(50) NOT NULL,
  landmark VARCHAR(200),
  alternate_phone VARCHAR(15),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. SHOPS / SERVICE VENDORS
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(150) UNIQUE NOT NULL,
  service_type service_type NOT NULL DEFAULT 'FOOD_DINING',
  image_url TEXT,
  description TEXT,
  is_open BOOLEAN DEFAULT true,
  is_snoozed BOOLEAN DEFAULT false,
  snoozed_until TIMESTAMPTZ,
  delivery_enabled BOOLEAN DEFAULT true,
  delivery_fee DECIMAL(10, 2) DEFAULT 0.00,
  min_order_for_free_delivery DECIMAL(10, 2) DEFAULT NULL,
  prep_time_minutes INT DEFAULT 20,
  upi_vpa VARCHAR(100),
  phone VARCHAR(15) NOT NULL,
  rating DECIMAL(2, 1) DEFAULT 4.8,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. CATALOG (FOOD & SERVICES)
CREATE TABLE IF NOT EXISTS catalog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES catalog_categories(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  discounted_price DECIMAL(10, 2),
  image_url TEXT,
  is_veg BOOLEAN DEFAULT true,
  is_available BOOLEAN DEFAULT true,
  duration_minutes INT DEFAULT NULL, -- for salons/service appointments
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ORDERS & DELIVERIES
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(20) UNIQUE NOT NULL,
  campus_id UUID NOT NULL REFERENCES campuses(id),
  shop_id UUID NOT NULL REFERENCES shops(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  address_id UUID REFERENCES customer_addresses(id),
  
  status order_status DEFAULT 'PLACED',
  delivery_pin VARCHAR(4) NOT NULL, -- 4-digit verification PIN required to complete delivery
  
  items_subtotal DECIMAL(10, 2) NOT NULL,
  delivery_fee DECIMAL(10, 2) DEFAULT 0.00,
  platform_fee DECIMAL(10, 2) DEFAULT 0.00,
  tax_fee DECIMAL(10, 2) DEFAULT 0.00,
  total_amount DECIMAL(10, 2) NOT NULL,
  
  special_instructions TEXT,
  estimated_delivery_time TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id),
  item_name VARCHAR(200) NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  total_price DECIMAL(10, 2) NOT NULL
);

-- 9. PAYMENTS & TRANSACTIONS
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_method payment_method NOT NULL,
  status payment_status DEFAULT 'PENDING',
  transaction_ref VARCHAR(100),
  amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. SUPPORT & DISPUTE TICKETS (Query Resolver)
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES users(id),
  assigned_to TEXT REFERENCES users(id),
  subject VARCHAR(200) NOT NULL,
  status VARCHAR(30) DEFAULT 'OPEN',
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_campus_shops ON shops(campus_id, is_open);
CREATE INDEX IF NOT EXISTS idx_catalog_items ON catalog_items(shop_id, is_available);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_shop ON orders(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
