-- Go-Bite P0 gap fix: bring Postgres schema in line with what the code already queries.
-- Additive only (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) so it applies cleanly
-- on top of 20260924_initial_schema.sql.
-- Covers: shops merchandising fields, orders idempotency + money CHECKs,
-- order_status_history, audit_logs, device_tokens, notification_logs,
-- support_tickets body column, payments gateway_order_id.

-- ---- shops: merchandising / settlement fields read by UI + SupabaseStore ----
ALTER TABLE shops ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS banner_text TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS commission_pct DECIMAL(5,2) DEFAULT 0.00;

-- ---- orders: idempotency key the store writes/reads ----
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_orders_idem_customer_key'
  ) THEN
    CREATE UNIQUE INDEX idx_orders_idem_customer_key ON orders(customer_id, idempotency_key);
  END IF;
END $$;

-- ---- orders: money invariants (ADR-005 mirror as DB CHECKs) ----
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_money_sum') THEN
    ALTER TABLE orders ADD CONSTRAINT chk_orders_money_sum
      CHECK (total_amount = items_subtotal + delivery_fee + platform_fee + tax_fee);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_money_nonneg') THEN
    ALTER TABLE orders ADD CONSTRAINT chk_orders_money_nonneg
      CHECK (items_subtotal >= 0 AND delivery_fee >= 0 AND platform_fee >= 0 AND tax_fee >= 0 AND total_amount >= 0);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_items_line_math') THEN
    ALTER TABLE order_items ADD CONSTRAINT chk_order_items_line_math
      CHECK (total_price = unit_price * quantity);
  END IF;
END $$;

-- ---- payments: gateway order id used by webhook reconcile ----
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_order_id TEXT;
CREATE INDEX IF NOT EXISTS idx_payments_gateway ON payments(gateway_order_id);

-- ---- order_status_history: durable state-machine audit + SSE replay source ----
CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_status,
  to_status order_status NOT NULL,
  actor_id TEXT REFERENCES users(id),
  actor_role user_role,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_history ON order_status_history(order_id, created_at);

-- ---- audit_logs: privileged-action trail (read by new admin viewer) ----
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id TEXT NOT NULL REFERENCES users(id),
  actor_role user_role NOT NULL,
  campus_id UUID REFERENCES campuses(id),
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(60) NOT NULL,
  entity_id TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- ---- device_tokens: Expo/FCM push registration (Phase 9 contract) ----
CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,
  expo_push_token TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, expo_push_token)
);
CREATE INDEX IF NOT EXISTS idx_device_user ON device_tokens(user_id, is_active);

-- ---- notification_logs: SMS/push delivery receipts ----
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  channel VARCHAR(20) NOT NULL,
  template VARCHAR(60) NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(20) DEFAULT 'QUEUED',
  provider_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notification_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_template ON notification_logs(template, status, created_at DESC);

-- ---- support_tickets: body column (type + API already carry subject/body) ----
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS body TEXT DEFAULT '';

-- ---- sessions: token_hash column the store reads/writes ----
-- (initial schema created sessions.token; server code uses token_hash)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS token_hash TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sessions_token_hash') THEN
    CREATE UNIQUE INDEX idx_sessions_token_hash ON sessions(token_hash);
  END IF;
END $$;

-- ---- hot queue partial index (shop dashboard polls live orders only) ----
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_orders_shop_active') THEN
    CREATE INDEX idx_orders_shop_active ON orders(shop_id, created_at DESC)
      WHERE status IN ('PLACED', 'ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_orders_campus_created ON orders(campus_id, created_at DESC);
