# 03 — Database

> PostgreSQL 16 + PostGIS, self-hosted (Supabase-compatible). Schema = plan.md §8; Drizzle ORM in `packages/db`. **Postgres is the source of truth for everything durable and financial.**

## 3.1 Entity Map (mental model)
```text
campuses ─┬─< campus_locations ─< customer_addresses >─ users ─┬─ sessions / otps
          ├─< shops >─ users(SHOP_*)                           ├─ device_tokens / notification_logs
          │      └─< catalog_categories ─< catalog_items       ├─ support_tickets
          └─< orders >─< order_items                           └─ audit_logs
                  ├─< payments
                  ├─< order_status_history
                  └── customer_id → users
```

## 3.2 Table Reference
| Table | Purpose | Key columns (beyond PK/timestamps) | Relations |
|:--|:--|:--|:--|
| `campuses` | Tenancy root + geofence | `slug`, `code` (IITP-BIHTA), `center_lat/lng`, `radius_meters`, `is_active` | parent of shops, orders, locations |
| `users` | Better Auth-compatible identity | `id TEXT` (auth-generated), `phone` UNIQUE, `role`, `active_campus_id`, `shop_id`, `phone_verified` | → campuses, shops |
| `sessions` | Auth sessions (mirror of Redis) | `token` UNIQUE, `expires_at`, `ip_address`, `user_agent` | → users CASCADE |
| `otps` | OTP hashes | `phone`, `otp_hash` (argon2id+pepper), `expires_at`, `attempts`, `is_used` | — |
| `campus_locations` | Hostel/gate directory | `name`, `type` (drop_location_type), `delivery_allowed_at_door` | → campuses CASCADE |
| `customer_addresses` | Saved drop points | `campus_location_id`, `room_or_flat`, `landmark`, `is_default` | → users, campus_locations |
| `shops` | Vendors | `service_type`, `is_open`, `is_snoozed`, `snoozed_until`, `delivery_fee`, `min_order_for_free_delivery`, `prep_time_minutes`, `commission_pct`, `upi_vpa` | → campuses |
| `catalog_categories` | Menu sections | `name`, `display_order` | → shops CASCADE |
| `catalog_items` | Menu/service items | `price`, `discounted_price`, `is_veg`, `is_available`, `duration_minutes` | → shops, categories |
| `orders` | The core aggregate | `order_number` (GB-BIH-10492), `idempotency_key` UNIQUE, `status`, `delivery_pin`, money columns, `estimated_delivery_time`, `cancelled_at/reason` | → campuses, shops, users, addresses |
| `order_items` | Snapshotted lines | `item_name`, `unit_price`, `quantity`, `total_price` (denormalized on purpose) | → orders CASCADE |
| `payments` | Gateway ledger | `payment_method`, `status`, `transaction_ref`, `gateway_order_id`, `amount` | → orders CASCADE |
| `order_status_history` | State-machine audit + SSE replay | `from_status`, `to_status`, `actor_id/role`, `note` | → orders CASCADE |
| `support_tickets` | Disputes | `order_id?`, `assigned_to`, `subject`, `status`, `resolution_notes` | → users, orders |
| `audit_logs` | Privileged-action trail | `action`, `entity`, `entity_id`, `metadata JSONB`, `ip_address` | → users, campuses |
| `device_tokens` | RN push registration (Phase 9) | `platform`, `expo_push_token`, `is_active` | → users CASCADE |
| `notification_logs` | SMS/push receipts | `channel`, `template`, `status`, `provider_ref` | → users |

## 3.3 Enums
| Enum | Values |
|:--|:--|
| `user_role` | SUPER_ADMIN, CAMPUS_ADMIN, CONFIG_CHANGER, QUERY_RESOLVER, SHOP_OWNER, SHOP_STAFF, CUSTOMER |
| `service_type` | FOOD_DINING, SALON_GROOMING, LAUNDRY, PRINT_STATIONERY, CAMPUS_STORE |
| `order_status` | PLACED, ACCEPTED, PREPARING, OUT_FOR_DELIVERY, DELIVERED, CANCELLED, DISPUTED |
| `payment_status` | PENDING, CAPTURED, FAILED, REFUNDED |
| `payment_method` | UPI_INTENT, GATEWAY_ONLINE, CASH_ON_DELIVERY, CAMPUS_WALLET (reserved) |
| `drop_location_type` | BOYS_HOSTEL, GIRLS_HOSTEL, ACADEMIC_BLOCK, CAMPUS_GATE, FACULTY_QUARTERS, LIBRARY |

## 3.4 Indexes (and why)
| Index | Serves |
|:--|:--|
| `idx_campus_shops (campus_id, is_open)` | catalog listing hot path |
| `idx_catalog_items (shop_id, is_available)` | menu reads |
| `idx_orders_customer/shop (…, status)` | order lists + live queue |
| `idx_orders_shop_active` **partial** (`PLACED…OUT_FOR_DELIVERY`) | shop dashboard active queue — tiny, hot |
| `idx_orders_campus_created`, `idx_orders_created` | admin/analytics + cursor pagination |
| `idx_order_history (order_id, created_at)` | tracking timeline |
| `idx_audit_*`, `idx_device_user`, `idx_payments_gateway` | admin lookups / push / webhook↔payment join |

## 3.5 Money Rules (ADR-005)
- DB: `DECIMAL(10,2)` INR. API: integer **`*_paise`**. Conversion only via `toPaise()/fromPause()` in `packages/types`.
- CHECK-style invariants enforced in `orderService`: `subtotal + delivery_fee + platform_fee + tax_fee == total_amount`; per-line `total_price == unit_price * quantity`.

## 3.6 Migrations Workflow (forward-only)
```bash
# 1. edit packages/db/schema.ts  2. generate  3. review SQL  4. apply  5. commit BOTH
pnpm db:generate    # → packages/db/migrations/NNNN_*.sql
pnpm db:migrate
pnpm openapi:diff   # contract still intact?
```
Rules: never edit an applied migration; additive-first for zero-downtime (new column nullable/defaulted → backfill → constrain); RLS policies ship in the same migration (plan §6.3); CI `drizzle-kit check` blocks drift.

## 3.7 Row-Level Security (defense in depth)
Role `app_user` gets SELECT/INSERT/UPDATE limited by transaction GUCs (`app.campus_id`, `app.shop_id`) on `shops`, `catalog_items`, `orders`. Application-layer `ActorContext` scoping (plan §6.3) is the first guard; RLS is the second. Cross-tenant probes → WARN `security.tenant_probe`.

## 3.8 Seeds
`pnpm db:seed` is idempotent (upsert by `slug`/`phone`): 3 campuses, 6 shops, 40+ items, 7 role users (see [02-getting-started](02-getting-started.md)), default config values (`codMaxPaise`, caps).

→ Next: [Redis](04-redis.md)
