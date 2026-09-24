# Go-Bite: Multi-Campus Hyperlocal Delivery & Concierge Platform
## Master Engineering & Operational Blueprint (plan.md) — v2.0 Enhanced

> **Document Status:** BINDING ENGINEERING CONTRACT
> **Audience:** Autonomous coding agents and engineers building Go-Bite
> **Revision History:** v1.0 initial blueprint → v2.0 adds Redis architecture, monorepo/API-first structure for future React Native parity, strict API contracts, security/observability/testing/DevOps specifications, agent guardrails, and ADRs.

---

## 0. How Agents Must Use This Plan (READ FIRST)

1. This document is the **single source of truth**. If code and plan disagree, fix the code — or obtain explicit human approval to amend the plan and record the amendment as an ADR in Section 22.
2. Build **strictly in the phase order** of Section 21. Do not start Phase N+1 until every Definition-of-Done (DoD) checkbox of Phase N passes.
3. All identifiers in this plan — folder layout, Redis key patterns, endpoint paths, error codes, env vars, table/column names — are **normative**. Use them verbatim. They exist so the Next.js web app and the future React Native app share one backend contract with zero rework.
4. Never invent endpoints, columns, env vars, or Redis keys not listed here. If a genuine gap is found, implement the smallest possible addition, document it as a new ADR, and flag it in the PR description.
5. Every commit uses Conventional Commits and references its phase: `feat(phase-3): redis-backed cart service`.
6. Run all quality gates (Section 17) before marking any task complete.
7. Money is transported in API contracts as **integer paise** (`*_paise` fields). Never floats. Conversion helpers `toPaise()` / `fromPaise()` live in `packages/types` (see ADR-005).

## Table of Contents
1. Executive Summary & Legal Framing
2. Technology Stack & Toolchain (pinned)
3. Monorepo Architecture & React Native Migration Strategy
4. System Architecture Overview
5. Multi-Campus Architecture & Geofencing
6. Authentication, RBAC & Multi-Tenancy
7. Redis Architecture (Cache, Sessions, Cart, Rate Limiting, Locks, Pub/Sub, Queues)
8. PostgreSQL / Supabase Schema (DDL)
9. API Contract Specification v1
10. Order State Machine & Shop Self-Delivery Workflow
11. Real-Time Event Architecture (SSE + Redis Pub/Sub → FCM)
12. Fast2SMS Notification & OTP Architecture
13. Payments & Webhook Security (Razorpay)
14. Frontend UI / Figma Alignment (`YumQuick`)
15. Security Hardening & Abuse Prevention
16. Observability, Logging & Error Standards
17. Testing Strategy & Quality Gates
18. DevOps: Docker, Environments & CI/CD
19. Environment Variables Reference
20. Agent Execution Guardrails & Coding Conventions
21. Phased Implementation Roadmap (with DoD)
22. Architecture Decision Records (ADRs)

---

## 1. Executive Summary & Legal Framing (Strategy 1)

### 1.1 Business Model & Positioning
**Go-Bite** is architected as an **On-Demand Hyperlocal Campus Logistics & Concierge Platform** (not a Food Aggregator).
- **The Legal Mechanism:** Go-Bite provides digital coordination and errand/delivery logistics connecting university students with registered merchants located on or around academic campuses.
- **Why this solves the Payment Gateway / FSSAI Problem:**
  - Merchants are onboarded as independent vendors on an errand/logistics platform (MCC 4215 – Courier/Delivery Services & Logistics Platform).
  - The platform operates as a marketplace and technology intermediary under Section 79 of the Indian IT Act.
  - Payment gateways (Razorpay, Cashfree, PhonePe) approve the platform under Software/Logistics categories without blocking on FSSAI licenses.
- **Multi-Vertical Extensibility:** Because the platform is framed around *campus errands and localized services*, it smoothly accommodates non-food categories:
  1. **Food & Beverages:** Night mess, canteens, cafes, street juice stalls.
  2. **Grooming & Salon:** Haircuts, styling, grooming slots (appointment-based delivery/booking).
  3. **Laundry & Dry Cleaning:** Bag pickup, wash & iron, delivery back to hostel room.
  4. **Stationery & Quick Printouts:** Document upload and print delivery before lecture hours.
  5. **Campus Essentials:** Emergency pharmacy run, toiletries, hostel supplies.

### 1.2 Product Surfaces (all consuming the same `/api/v1` backend)
| Surface | App / Route Space | Primary Roles | Phase |
| :--- | :--- | :--- | :--- |
| Customer Web App | `apps/web` → `/app/*` | `CUSTOMER` | 5 |
| Shop Self-Delivery Hub | `apps/web` → `/shop/*` | `SHOP_OWNER`, `SHOP_STAFF` | 4 |
| Admin & Config Console | `apps/web` → `/admin/*` | `SUPER_ADMIN`, `CAMPUS_ADMIN`, `CONFIG_CHANGER` | 6 |
| Support Desk | `apps/web` → `/support/*` | `QUERY_RESOLVER` | 6 |
| Mobile App (future) | `apps/mobile` (Expo RN) | `CUSTOMER` (+ later shop roles) | 9 |

---

## 2. Technology Stack & Toolchain (Pinned)

Every tool below is **mandatory**; substitutions require an ADR. Versions are minimums — pin exact versions in `package.json` / lockfile at bootstrap and do not float majors mid-build.

| Layer | Tool | Min Version | Why (non-negotiable) |
| :--- | :--- | :--- | :--- |
| Runtime | Node.js LTS | 22.x | Long support window; required by Next 15 |
| Package manager | pnpm | 9.x | Workspace-native, fast, strict node_modules |
| Monorepo | Turborepo | 2.x | Cached task graphs across `apps/*` + `packages/*`; RN app slots in later without restructure |
| Web framework | Next.js (App Router, TS strict) | 15.x | RSC + Route Handlers serve both web UI and `/api/v1` |
| Language | TypeScript `strict: true` | 5.6+ | Shared types power web + RN reuse |
| Styling | Tailwind CSS + shadcn/ui | TW 4.x | Design tokens (Section 14) map 1:1 to NativeWind on RN later |
| Client state | Zustand | 5.x | Runs unchanged on React Native |
| Server state | TanStack Query | 5.x | Same hooks/hydration patterns work on RN; wraps `packages/api-client` |
| Validation | Zod | 3.x | Single source of truth for API contracts in `packages/types` — reused by server, web, RN |
| ORM / Migrations | Drizzle ORM + drizzle-kit | latest stable | Type-safe SQL against self-hosted Postgres; migration files committed |
| Database | PostgreSQL + PostGIS | 16 / 3.4 | Self-hosted (Supabase-compatible schema); geofencing |
| **Cache / Broker** | **Redis** (self-hosted; Upstash only for ephemeral preview envs) | 7.x | Sessions, cart, cache, rate limits, idempotency, locks, Pub/Sub, BullMQ (Section 7) |
| Redis client | `ioredis` | 5.x | BullMQ-compatible; Lua scripting; Sentinel-ready |
| Job queues | BullMQ | 5.x | OTP/SMS, notifications, payment reconciliation, order auto-cancel, snooze wake |
| Auth | Better Auth (`phoneNumber` OTP plugin + bearer token plugin) | latest | Cookie sessions for web, Bearer tokens for RN; **Redis as secondary storage** |
| SMS | Fast2SMS bulkV2 | — | India OTP delivery (Section 12) |
| Payments | Razorpay (UPI Intent + webhooks) | API v1 | Gateway approval under logistics MCC (Section 13) |
| Realtime (web) | SSE over Route Handler + Redis Pub/Sub | — | Order tracking, shop order alerts (Section 11) |
| Push (mobile, Phase 9) | Expo Push Notifications (FCM/APNs) | SDK 52+ | Abstracted behind `NotificationProvider` now |
| Logging | pino + pino-http | 9.x | Structured JSON logs with request IDs |
| Error tracking | Sentry (`@sentry/nextjs`) | 8.x | Web + API; RN SDK added in Phase 9 |
| Unit/Integration | Vitest + Testing Library + testcontainers | 2.x | PG+Redis spin-up for API integration tests |
| E2E | Playwright | latest | Critical flows: OTP (mocked SMS), order lifecycle, PIN delivery |
| Load | k6 | latest | Smoke scripts for menu read + order write paths |
| Lint/Format | ESLint (flat) + Prettier + Husky + lint-staged | latest | Pre-commit gate |
| Design extraction | Figma MCP server (already configured in `.vscode/mcp.json`) | — | Pull tokens/nodes directly from `YumQuick` file |
| CI/CD | GitHub Actions + Docker + docker-compose | — | Section 18 |
| Local infra | docker-compose: Postgres 16 + PostGIS, Redis 7 (AOF) | — | Section 18.1 |

**Explicitly NOT in stack (do not add without ADR):** tRPC (breaks RN/OpenAPI contract-first goal), Prisma, NextAuth/Auth.js, Socket.IO (SSE+Pub/Sub is sufficient and RN-friendly), Firebase Auth, GraphQL, Redux.

---

## 3. Monorepo Architecture & React Native Migration Strategy

The single most important architectural decision: **the backend is API-first and client-agnostic from day one.** The Next.js web app is merely the first consumer of `/api/v1`. This makes the React Native conversion a *new client*, not a rewrite (ADR-001).

### 3.1 Repository Layout (normative)
```text
go-bite/
├── apps/
│   ├── web/                    # Next.js 15 — customer app + shop hub + admin console + support desk
│   │   ├── app/                # App Router: /app/* /shop/* /admin/* /support/* + app/api/v1/*
│   │   ├── components/         # shadcn/ui based, presentational only
│   │   └── lib/                # web-only adapters (cookies, SSE hooks)
│   ├── worker/                 # Node process: BullMQ workers (sms-otp, notifications, payment-reconcile, order-timeout, snooze-wake)
│   └── mobile/                 # (Phase 9) Expo React Native — consumes packages/api-client verbatim
├── packages/
│   ├── types/                  # Zod schemas + TS DTOs for EVERY API request/response; money helpers; error codes enum
│   ├── core/                   # Framework-agnostic business logic: services, order state machine, pricing engine. NEVER imports next/* or react/*
│   ├── db/                     # Drizzle schema, drizzle-kit migrations, seed scripts
│   ├── redis/                  # ioredis singleton, cache helpers, rate limiters, locks, idempotency, pub/sub event bus
│   ├── api-client/             # Typed fetch client generated from packages/types (used by web AND mobile)
│   └── config/                 # Design tokens (Section 14), shared constants, env schema (zod-validated)
├── infra/
│   ├── docker-compose.yml      # postgres16+postgis, redis7
│   └── scripts/                # backup, seed, load-test entrypoints
├── .github/workflows/          # ci.yml, deploy.yml
├── turbo.json
├── pnpm-workspace.yaml
└── plan.md (this file)
```

### 3.2 Dependency & Layering Rules (enforced by ESLint boundaries)
1. `apps/*` may import `packages/*`; `packages/*` may **never** import from `apps/*`.
2. `packages/core` and `packages/types` import **zero** framework code (`next`, `react`, `expo`) — they must run in Node (worker) and Metro (RN) unmodified.
3. Route Handlers are **thin**: authenticate → validate (Zod from `packages/types`) → call `packages/core` service → serialize response envelope. No SQL, no Redis calls, no business rules in route files.
4. React Server Components may read via `packages/core` for SSR, but **all mutations** go through `/api/v1` Route Handlers so behavior is identical for web and RN. No Next.js Server Actions for domain mutations (ADR-001).
5. Client data fetching only through `packages/api-client` wrapped in TanStack Query hooks (`useShops`, `useCart`, `useOrder`) — these hooks are copy-paste portable to RN.

### 3.3 React Native Conversion Contract (what Phase 9 must be able to do)
| Concern | Decision made NOW | RN payoff later |
| :--- | :--- | :--- |
| API surface | Versioned REST `/api/v1/*`, OpenAPI generated from Zod schemas | Zero backend changes; regenerate typed client |
| Auth | Better Auth dual mode: httpOnly cookie (web) + `Authorization: Bearer` token (mobile) | Store token in `expo-secure-store`; same login endpoints |
| Validation | Zod schemas in `packages/types` | Reuse for form validation in RN |
| State | Zustand + TanStack Query only | Both run on RN unchanged |
| Cart | Server-side cart in Redis keyed by `user_id` (Section 7.4) | Cart syncs across web ↔ phone for free |
| Realtime | SSE now; events via Redis channels behind `EventBus` interface | RN swaps transport to FCM push + polling; payload format frozen in Section 11.3 |
| Push | `device_tokens` table + `NotificationProvider` interface exist from Phase 3 | Plug in Expo Push provider in Phase 9 only |
| Styling | Tokens in `packages/config/tokens.ts`; Tailwind on web | NativeWind consumes same tokens on RN |
| Money | Integer paise at API boundary | No float bugs on either platform |
| Deep links | Order/tracking URLs structured `/orders/{orderNumber}` | Universal links map 1:1 to RN routes |

---

## 4. System Architecture Overview

```mermaid
flowchart LR
    subgraph Clients
      Web["Next.js Web (apps/web)"]
      RN["React Native (apps/mobile — Phase 9)"]
    end
    subgraph API["apps/web — Next.js App Router"]
      RH["Route Handlers /api/v1 (thin)"]
      SSE["SSE Stream /api/v1/events/stream"]
      CoreSvc["packages/core services"]
    end
    PG[("PostgreSQL 16 + PostGIS")]
    RD[("Redis 7<br/>sessions · cart · cache · rate-limit<br/>idempotency · locks · pub/sub · BullMQ")]
    WK["apps/worker (BullMQ consumers)"]
    subgraph External
      F2S["Fast2SMS"]
      RZP["Razorpay"]
      XP["Expo Push / FCM (Phase 9)"]
    end
    Web --> RH
    RN -- "same /api/v1 contract" --> RH
    RH --> CoreSvc
    CoreSvc --> PG
    CoreSvc --> RD
    RD -- "pub/sub order events" --> SSE
    SSE --> Web
    WK --> RD
    WK --> F2S
    WK --> XP
    RZP -- "signed webhook" --> RH
    RH --> RZP
```

**Process model in production:** 3 deployables — (1) `web` (Next.js server, stateless, horizontally scalable), (2) `worker` (BullMQ consumers, ≥1 replica), (3) infra (Postgres, Redis). Web is stateless *because* all mutable hot state lives in Redis/Postgres — scale-out requires no sticky sessions.

---

## 5. Multi-Campus Architecture & Geofencing

### 5.1 Campus Isolation Hierarchy
Each campus is a self-contained operational universe (`campus_id`). A student at **IIT Patna (Bihta)** must never see vendors, night messes, or salon slots from **IIT Kanpur** or **NIT Patna**.

```mermaid
flowchart TD
    User["Student Enters App"] --> Geo["Detect Coordinates or Select Campus"]
    Geo --> CampusSelector["Set Active Campus (e.g. 'IIT Patna - Bihta')"]
    CampusSelector --> FilteredCatalog["Campus-Isolated Catalog & Vendors"]

    subgraph Campus["Campus: IIT Patna (Bihta)"]
        V1["Night Canteen 1 (Hostel C)"]
        V2["Nescafe Kiosk"]
        V3["Campus Salon & Barber"]
        V4["Laundry Service"]
    end

    FilteredCatalog --> Campus
```

### 5.2 Geofencing & Fallback Logic
1. **GPS Geofence Match (two-tier):**
   - *Tier 1 — Redis GEO (hot path):* Campus centers are loaded into the Redis geoset `gb:geo:campuses` (`GEOADD` per campus). On request, `GEOSEARCH gb:geo:campuses FROMLONLAT {lng} {lat} BYRADIUS 4000 m ASC COUNT 1` resolves the nearest campus in O(log N) without touching Postgres. The geoset is refreshed by a BullMQ repeatable job every hour and invalidated immediately on campus CRUD.
   - *Tier 2 — PostGIS (authoritative):* When a `boundary_polygon` exists or Tier 1 misses, Postgres `ST_Contains(boundary_polygon, ST_Point(lng, lat))` (or `ST_DWithin(center, point, radius_meters)`) decides. Tier 2 result back-fills Tier 1 behavior for ambiguous points.
2. **Explicit Campus Selector:** If GPS is ambiguous, permissions are denied, or the student is off-campus ordering for a roommate inside, a prompt displays:
   *"Select your Campus: [IIT Patna - Bihta] [IIT Kanpur] [NIT Patna]..."*
3. **Session Anchoring:** `active_campus_id` is persisted (a) on the `users` row (authoritative, cross-device), (b) in Redis `gb:user:{userId}:campus` (TTL 24h, hot read), and (c) mirrored into an httpOnly cookie for SSR rendering. RN reads it from the session payload — no cookie dependency.
4. **Invariant:** Every catalog/order query in `packages/core` takes `campusId` as an explicit first-class parameter and asserts it matches the session's active campus. There is no code path that returns cross-campus data (see tenant rules, Section 6.3).

---

## 6. Authentication, RBAC & Multi-Tenancy

### 6.1 Authentication Strategy (Better Auth, dual-mode)
- **Provider:** Better Auth with `phoneNumber` plugin (OTP via Fast2SMS, Section 12) — phone-first, no passwords.
- **Web transport:** httpOnly, `Secure`, `SameSite=Lax` session cookie (`__Host-gb.session`).
- **Mobile transport (contract frozen now):** Better Auth bearer plugin — `POST /api/v1/auth/otp/verify` returns `{ user, sessionToken, expiresAt }`; RN stores `sessionToken` in `expo-secure-store` and sends `Authorization: Bearer <token>`. The middleware accepts **either** credential form on every endpoint — same code path, same RBAC.
- **Session storage:** Better Auth `secondaryStorage` = Redis. Session record cached at `gb:session:{token}` (hash, sliding TTL 30d, hot-read TTL 30s in-process). Logout deletes the Redis key → instant global revocation (critical for lost student phones).
- **Session fixation/rotation:** token rotates on OTP verify and every 7 days; old token invalidated atomically in Redis.

### 6.2 Permission Matrix
| Role | Scope | Permissions & Responsibilities |
| :--- | :--- | :--- |
| **`SUPER_ADMIN`** | Global (All Campuses) | Onboard new campuses, create campus admins, set commission splits, access global financial ledgers and platform audit logs. |
| **`CAMPUS_ADMIN`** | Campus-Scoped | Manage vendors in their campus, adjust campus boundary, toggle campus-wide maintenance/snooze, manage banner alerts. |
| **`CONFIG_CHANGER`** | Campus / Global | Edit platform parameters: maximum active order caps, base delivery fees, surge pricing triggers, dynamic operating hours. |
| **`QUERY_RESOLVER`** | Campus-Scoped | View customer disputes, inspect delivery PIN logs, handle cancellation requests, process student refunds. |
| **`SHOP_OWNER`** | Single Shop | Manage catalog/menu items, pricing, out-of-stock toggles, set shop-level delivery fees, configure kitchen prep buffer. |
| **`SHOP_STAFF`** | Single Shop | View live order queue, accept/reject incoming orders, update prep status, enter Student Delivery PIN. |
| **`CUSTOMER`** | Active Campus | Browse campus catalog, place orders/bookings, track order state machine, generate delivery PIN, raise support tickets. |

**Enforcement:** a single `requireRole(...roles)` helper in `packages/core` + per-route role declaration (Section 9). Authorization failures return `403 FORBIDDEN_TENANT` and are written to `audit_logs`.

### 6.3 Tenant Isolation Safeguards
All database queries must enforce tenant safety at the query builder layer:
```ts
// Example: Shop Owner updating an item
await db.update(catalogItems)
  .set({ isAvailable: false })
  .where(
    and(
      eq(catalogItems.id, itemId),
      eq(catalogItems.shopId, session.user.shopId) // Strict Tenant Scoping
    )
  );
```
Additional mandatory rules:
1. Every `packages/core` service function receives a **typed `ActorContext`** (`{ userId, role, campusId, shopId }`) — services never read sessions directly; route handlers build the context once.
2. Postgres **Row-Level Security** policies on `shops`, `catalog_items`, `orders` as a defense-in-depth second layer (role `app_user` with `app.campus_id` / `app.shop_id` GUCs set per transaction).
3. Cross-tenant access attempts (query returns 0 rows but ID exists in another tenant) emit `security.tenant_probe` log events at WARN level with request ID.

---

## 7. Redis Architecture (Cache, Sessions, Cart, Rate Limiting, Locks, Pub/Sub, Queues)

Redis is a **first-class infrastructure component**, not an afterthought. One Redis 7 instance (AOF `everysec`, `maxmemory-policy allkeys-lru`, dev 512 MB / prod 2 GB) serves all concerns below. All access goes through `packages/redis` — apps never instantiate their own clients.

### 7.1 Key Namespace Convention (normative)
Pattern: `gb:{domain}:{entity}[:{sub}]` — lowercase, colon-separated, no user-typed data in key names (IDs only).

| # | Concern | Key / Channel Pattern | Type | TTL / Policy |
| :--- | :--- | :--- | :--- | :--- |
| 1 | OTP cooldown | `gb:otp:cooldown:{phone}` | string `1` | 60 s (SET NX EX) |
| 2 | OTP hourly attempts | `gb:otp:attempts:{phone}` | string (INCR) | 1 h (EXPIRE on first set) |
| 3 | OTP lockout | `gb:otp:lockout:{phone}` | string | 1 h |
| 4 | Session cache | `gb:session:{token}` | hash | 30 d sliding (Better Auth secondaryStorage) |
| 5 | Active campus pointer | `gb:user:{userId}:campus` | string campusId | 24 h, refreshed on read |
| 6 | Server-side cart | `gb:cart:{userId}` | hash: `shopId`, `campusId`, `items` (JSON), `updatedAt` | 7 d sliding |
| 7 | Campus shop list cache | `gb:cache:campus:{campusId}:shops:v{ver}` | JSON string | 300 s + versioned invalidation |
| 8 | Shop menu cache | `gb:cache:shop:{shopId}:menu:v{ver}` | JSON string | 300 s + versioned invalidation |
| 9 | Shop live status | `gb:shop:{shopId}:status` | hash: `isOpen`, `isSnoozed`, `snoozedUntil` | none — write-through on mutation |
| 10 | Campus geo index | `gb:geo:campuses` | GEO set | refreshed hourly + on campus CRUD |
| 11 | API rate limiting | `gb:rl:{bucket}:{identifier}` | ZSET (sliding window Lua) | window size |
| 12 | Idempotency keys | `gb:idem:{userId}:{key}` | string orderId (+ JSON response) | 24 h |
| 13 | Distributed locks | `gb:lock:{resource}:{id}` | string token (SET NX PX) | ≤ 30 s, Lua compare-del release |
| 14 | Order event bus | channel `gb:events:order:{orderId}` | Pub/Sub | — |
| 15 | Shop order feed | channel `gb:events:shop:{shopId}:orders` | Pub/Sub | — |
| 16 | Campus announcements | channel `gb:events:campus:{campusId}` | Pub/Sub | — |
| 17 | Metrics counters | `gb:metrics:{yyyymmdd}:{metric}` | string (INCR) | 90 d |
| 18 | BullMQ queues | `bull:{queue}:*` (managed) | BullMQ | see 7.7 |

### 7.2 Client Singleton (`packages/redis/src/client.ts`)
```ts
import { Redis } from "ioredis";
import { env } from "@gobite/config";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,   // required by BullMQ
  enableReadyCheck: true,
  keyPrefix: "",                // prefixes are explicit in key builders
  retryStrategy: (n) => Math.min(n * 100, 2000),
});
// Dedicated connection for subscriber/blocking usage:
export const redisSub = redis.duplicate();
```
Key builders live in `packages/redis/src/keys.ts` (`keys.cart(userId)` etc.) — raw string keys are forbidden elsewhere.

### 7.3 Cache-Aside Pattern with Stampede Protection
```ts
export async function cached<T>(key: string, ttlSec: number, loader: () => Promise<T>): Promise<T> {
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit) as T;
  return withLock(`lock:cache:${key}`, 10_000, async () => {  // single-flight rebuild
    const again = await redis.get(key);
    if (again) return JSON.parse(again) as T;
    const fresh = await loader();
    await redis.set(key, JSON.stringify(fresh), "EX", ttlSec);
    return fresh;
  });
}
```
**Invalidation:** catalog/shop mutations bump a per-shop version counter (`INCR gb:ver:shop:{shopId}`); cached keys embed `v{ver}` so stale versions expire naturally — no wildcard `KEYS`/`SCAN` purges in production code paths.

### 7.4 Server-Side Cart (web ↔ RN sync foundation)
- One active cart per user, **single-shop rule**: adding an item from a different shop returns `409 CART_CONFLICT_SINGLE_SHOP` with the current cart payload so the client can offer "Replace cart?".
- Stored at `gb:cart:{userId}` (never in Postgres, never only on device) — a student can start an order on the library desktop and finish it on their phone.
- `POST /api/v1/cart/validate` re-prices every line against the menu cache/DB at checkout (prices are never trusted from the client).

### 7.5 Sliding-Window Rate Limiter (Lua, atomic)
```lua
-- packages/redis/src/lua/ratelimit.lua
-- KEYS[1]=zset key, ARGV: now_ms, window_ms, limit, member
local now, window, limit = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
local count = redis.call('ZCARD', KEYS[1])
if count >= limit then return {0, redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')[2]} end
redis.call('ZADD', KEYS[1], now, ARGV[4])
redis.call('PEXPIRE', KEYS[1], window)
return {1, 0}
```
Buckets and limits are declared in Section 15.2. Middleware: `packages/redis/src/rateLimit.ts` → `assertRateLimit(bucket, identifier)` throws `RATE_LIMITED` with `retryAfterSec`.

### 7.6 Idempotency & Distributed Locks
- **Idempotency:** mutating endpoints marked ⚠ in Section 9 require an `Idempotency-Key` header (UUID v4). Handler: `SET gb:idem:{userId}:{key} {orderId} NX EX 86400` — on `nil` reply, return the stored response with header `Idempotency-Replayed: true` (HTTP 200). This kills duplicate orders from double-taps and mobile retries on flaky campus Wi-Fi.
- **Locks:** `withLock(resource, ttlMs, fn)` = `SET gb:lock:{resource} {uuid} NX PX {ttl}` + Lua compare-and-delete release. Used for: payment webhook processing (`lock:webhook:{eventId}`), cache rebuilds, settlement batches, shop snooze transitions.

### 7.7 BullMQ Job Queues (apps/worker)
| Queue | Job | Trigger | Retry / Notes |
| :--- | :--- | :--- | :--- |
| `sms-otp` | Send OTP via Fast2SMS | Enqueued by auth service (request path stays <300 ms) | 3 attempts, exp backoff, DLQ → alert |
| `notifications` | Templated SMS / push (Phase 9 Expo Push) | Order state transitions | 5 attempts; logs to `notification_logs` |
| `order-timeout` | Auto-cancel `PLACED` orders not accepted within 10 min | Delayed job at order placement | Checks status atomically before cancelling; triggers refund if paid |
| `snooze-wake` | Unsnooze shop at `snoozed_until` | Delayed job on snooze | Also refreshes `gb:shop:{id}:status` |
| `payment-reconcile` | Poll Razorpay for `PENDING` payments older than 10 min | Repeatable every 5 min | Section 13.4 |
| `geo-refresh` | Rebuild `gb:geo:campuses` | Repeatable hourly | Section 5.2 |
| `metrics-rollup` | Persist `gb:metrics:*` counters to daily rows | Repeatable nightly | Feeds admin dashboard |

### 7.8 Failure & Degradation Doctrine
| Scenario | Behavior |
| :--- | :--- |
| Redis unreachable — cache read | Treat as miss, fall through to Postgres, log WARN `redis.cache_bypass` |
| Redis unreachable — rate limiter | **Fail-closed** on auth/payment endpoints (503 `DEPENDENCY_DOWN`), fail-open on read endpoints |
| Redis unreachable — cart | 503 `DEPENDENCY_DOWN` (never silently lose carts) |
| Redis unreachable — Pub/Sub publish | Order state change still commits to Postgres; SSE clients fall back to 15 s polling; `order_status_history` is the replayable source of truth |
| Postgres down | `/api/health/ready` fails → load balancer drains; nothing mutating is served from cache |

---

## 8. Complete PostgreSQL / Supabase Schema (DDL)

Managed as drizzle-kit migrations in `packages/db/migrations` — hand-editing the database is forbidden. RLS policies (Section 6.3) ship in the same migration files.

```sql
-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. ENUMS
CREATE TYPE user_role AS ENUM (
  'SUPER_ADMIN',
  'CAMPUS_ADMIN',
  'CONFIG_CHANGER',
  'QUERY_RESOLVER',
  'SHOP_OWNER',
  'SHOP_STAFF',
  'CUSTOMER'
);

CREATE TYPE service_type AS ENUM (
  'FOOD_DINING',
  'SALON_GROOMING',
  'LAUNDRY',
  'PRINT_STATIONERY',
  'CAMPUS_STORE'
);

CREATE TYPE order_status AS ENUM (
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'DISPUTED'
);

CREATE TYPE payment_status AS ENUM (
  'PENDING',
  'CAPTURED',
  'FAILED',
  'REFUNDED'
);

CREATE TYPE payment_method AS ENUM (
  'UPI_INTENT',
  'GATEWAY_ONLINE',
  'CASH_ON_DELIVERY',
  'CAMPUS_WALLET'
);

CREATE TYPE drop_location_type AS ENUM (
  'BOYS_HOSTEL',
  'GIRLS_HOSTEL',
  'ACADEMIC_BLOCK',
  'CAMPUS_GATE',
  'FACULTY_QUARTERS',
  'LIBRARY'
);

-- 3. CORE GEOGRAPHY & CAMPUSES
CREATE TABLE campuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  code VARCHAR(20) UNIQUE NOT NULL, -- e.g. IITP-BIHTA, IITK
  center_lat DECIMAL(10, 8) NOT NULL,
  center_lng DECIMAL(11, 8) NOT NULL,
  radius_meters INT DEFAULT 4000,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. BETTER AUTH COMPLIANT USER & AUTH TABLES
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone VARCHAR(15) UNIQUE NOT NULL,
  phone_verified BOOLEAN DEFAULT false,
  role user_role DEFAULT 'CUSTOMER',
  active_campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL,
  shop_id UUID, -- populated if user is SHOP_OWNER or SHOP_STAFF
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(15) NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT DEFAULT 0,
  is_used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CAMPUS HOSTELS / ADDRESS DIRECTORY
CREATE TABLE campus_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL, -- e.g. "Aryabhatta Hostel (Block A)"
  type drop_location_type NOT NULL,
  delivery_allowed_at_door BOOLEAN DEFAULT false, -- if false, drop-off is at gate
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campus_location_id UUID REFERENCES campus_locations(id) ON DELETE SET NULL,
  room_or_flat VARCHAR(50) NOT NULL,
  landmark VARCHAR(200),
  alternate_phone VARCHAR(15),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

```sql
-- 6. SHOPS / SERVICE VENDORS
CREATE TABLE shops (
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
  commission_pct DECIMAL(5, 2) DEFAULT 10.00, -- platform commission; SUPER_ADMIN managed
  upi_vpa VARCHAR(100), -- For direct shop settlements
  phone VARCHAR(15) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link user shop_id foreign key
ALTER TABLE users ADD CONSTRAINT fk_user_shop FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL;

-- 7. CATALOG (FOOD & SERVICES)
CREATE TABLE catalog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE catalog_items (
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
  -- Non-food attributes (e.g. for salons/services)
  duration_minutes INT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ORDERS & DELIVERIES
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(20) UNIQUE NOT NULL, -- e.g. GB-BIH-10492
  campus_id UUID NOT NULL REFERENCES campuses(id),
  shop_id UUID NOT NULL REFERENCES shops(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  address_id UUID REFERENCES customer_addresses(id),
  idempotency_key VARCHAR(80) UNIQUE, -- hard guarantee vs duplicate placement (Redis is hot layer)

  status order_status DEFAULT 'PLACED',
  delivery_pin VARCHAR(4) NOT NULL, -- 4-digit code required to complete delivery

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

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id),
  item_name VARCHAR(200) NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  total_price DECIMAL(10, 2) NOT NULL
);
```

```sql
-- 9. PAYMENTS & TRANSACTIONS
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_method payment_method NOT NULL,
  status payment_status DEFAULT 'PENDING',
  transaction_ref VARCHAR(100), -- UPI UTR or Gateway Ref
  gateway_order_id VARCHAR(100), -- Razorpay order id for reconciliation
  amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. SUPPORT & DISPUTE TICKETS (Query Resolver)
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES users(id),
  assigned_to TEXT REFERENCES users(id), -- Query Resolver ID
  subject VARCHAR(200) NOT NULL,
  status VARCHAR(30) DEFAULT 'OPEN', -- OPEN, INVESTIGATING, RESOLVED, REJECTED
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. ORDER STATUS HISTORY (state machine audit — source of truth for event replay)
CREATE TABLE order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_status,
  to_status order_status NOT NULL,
  actor_id TEXT REFERENCES users(id),
  actor_role user_role,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. AUDIT LOGS (every privileged action; SUPER_ADMIN visible)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id TEXT NOT NULL REFERENCES users(id),
  actor_role user_role NOT NULL,
  campus_id UUID REFERENCES campuses(id),
  action VARCHAR(100) NOT NULL,    -- e.g. SHOP_SNOOZE, CONFIG_UPDATE, REFUND_ISSUED
  entity VARCHAR(60) NOT NULL,     -- e.g. shop, order, config
  entity_id TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. DEVICE TOKENS (Expo Push / FCM — populated by RN app in Phase 9; contract exists now)
CREATE TABLE device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,   -- IOS, ANDROID, WEB
  expo_push_token TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, expo_push_token)
);

-- 14. NOTIFICATION LOGS (SMS/push delivery receipts)
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  channel VARCHAR(20) NOT NULL,    -- SMS, PUSH
  template VARCHAR(60) NOT NULL,   -- e.g. OTP, ORDER_ACCEPTED, OUT_FOR_DELIVERY
  payload JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(20) DEFAULT 'QUEUED', -- QUEUED, SENT, FAILED
  provider_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES FOR MAXIMUM QUERY EFFICIENCY
CREATE INDEX idx_campus_shops ON shops(campus_id, is_open);
CREATE INDEX idx_catalog_items ON catalog_items(shop_id, is_available);
CREATE INDEX idx_orders_customer ON orders(customer_id, status);
CREATE INDEX idx_orders_shop ON orders(shop_id, status);
CREATE INDEX idx_orders_campus_created ON orders(campus_id, created_at DESC);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
-- Hot queue partial index (shop dashboard polls/SSE against live orders only)
CREATE INDEX idx_orders_shop_active ON orders(shop_id, created_at DESC)
  WHERE status IN ('PLACED', 'ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY');
CREATE INDEX idx_order_history ON order_status_history(order_id, created_at);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX idx_device_user ON device_tokens(user_id, is_active);
CREATE INDEX idx_payments_gateway ON payments(gateway_order_id);
```

---

## 9. API Contract Specification v1 (normative)

Base path: `/api/v1`. All requests/responses validated by Zod schemas in `packages/types` (which also generates the OpenAPI 3.1 doc at `/api/v1/openapi.json`). ⚠ = `Idempotency-Key` header (UUID v4) required.

### 9.1 Response Envelope (every endpoint, no exceptions)
```jsonc
// success
{ "success": true,  "data": { /* payload */ }, "error": null,
  "meta": { "requestId": "req_01J...", "timestamp": "2026-09-24T12:00:00.000Z" } }
// failure
{ "success": false, "data": null,
  "error": { "code": "SHOP_CLOSED", "message": "Human readable", "details": {} },
  "meta": { "requestId": "req_01J...", "timestamp": "..." } }
```

### 9.2 Error Code Catalog (exhaustive — new codes require an ADR)
| Code | HTTP | Meaning |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | 400 | Zod failure; `details` carries field errors |
| `UNAUTHORIZED` | 401 | Missing/expired session or bearer token |
| `FORBIDDEN_TENANT` | 403 | Valid session, wrong role/tenant scope |
| `NOT_FOUND` | 404 | Entity absent (or cross-tenant — never leak existence) |
| `CAMPUS_REQUIRED` | 409 | No active campus resolved for the session |
| `SHOP_CLOSED` | 409 | Shop closed/snoozed at order placement |
| `SHOP_DELIVERY_DISABLED` | 409 | Delivery off for shop |
| `CART_CONFLICT_SINGLE_SHOP` | 409 | Cart belongs to another shop; payload includes current cart |
| `CART_EMPTY` / `CART_ITEM_UNAVAILABLE` | 409 | Checkout validation failures |
| `MIN_ORDER_NOT_MET` | 409 | Below shop minimum |
| `ORDER_INVALID_STATE` | 409 | Illegal state-machine transition (Section 10) |
| `PIN_MISMATCH` | 422 | Wrong delivery PIN (attempts capped at 5, then `PIN_LOCKED`) |
| `PIN_LOCKED` | 423 | PIN attempts exhausted → QUERY_RESOLVER flow |
| `AUTH_OTP_COOLDOWN` | 429 | OTP re-requested inside 60 s window (`retryAfterSec` in details) |
| `AUTH_OTP_INVALID` / `AUTH_OTP_EXPIRED` | 401 | Bad/expired code; attempts capped at 5 |
| `AUTH_OTP_LOCKED` | 423 | Hourly attempt ceiling hit |
| `RATE_LIMITED` | 429 | Sliding-window limiter (Section 15.2); `retryAfterSec` in details |
| `IDEMPOTENCY_REPLAY` | 200 | Original response replayed (also `Idempotency-Replayed: true` header) |
| `PAYMENT_FAILED` / `PAYMENT_PENDING` | 402 / 202 | Gateway outcomes |
| `DEPENDENCY_DOWN` | 503 | Redis/Postgres/gateway unreachable |
| `INTERNAL` | 500 | Unhandled — always paired with Sentry event id in `details.sentryId` |

### 9.3 Endpoint Map — Auth & Campus
| Method & Path | Role | Request → `data` | Notes |
| :--- | :--- | :--- | :--- |
| `POST /auth/otp/request` | public | `{ phone }` → `{ cooldownSec: 60 }` | Redis cooldown+lockout (Section 12); enqueues `sms-otp` job |
| `POST /auth/otp/verify` | public | `{ phone, otp, campusId? }` → `{ user, sessionToken, expiresAt }` | `sessionToken` consumed by RN; web also sets cookie |
| `POST /auth/logout` | any | → `{ ok: true }` | Deletes Redis session key (instant revocation) |
| `GET /auth/session` | any | → `{ user }` | `user` includes `activeCampusId`, `role`, `shopId` |
| `GET /campuses` | public | `?lat&lng` → `{ campuses, resolvedCampusId }` | Redis GEO tier first (Section 5.2) |
| `POST /users/me/campus` | CUSTOMER | `{ campusId }` → `{ user }` | Writes DB + `gb:user:{id}:campus` + cookie |

### 9.4 Endpoint Map — Catalog & Cart
| Method & Path | Role | Request → `data` | Notes |
| :--- | :--- | :--- | :--- |
| `GET /campuses/{campusId}/shops` | public | `?serviceType&openNow` → `{ shops[] }` | Cache `gb:cache:campus:{id}:shops:v{ver}` 300 s |
| `GET /shops/{shopId}` | public | → `{ shop }` | Merges live status hash `gb:shop:{id}:status` |
| `GET /shops/{shopId}/menu` | public | → `{ categories[], items[] }` | Cache 300 s; prices in paise |
| `GET /cart` | CUSTOMER | → `{ cart }` | Redis-backed (Section 7.4) |
| `PUT /cart/items` | CUSTOMER | `{ shopId, itemId, quantity }` → `{ cart }` | `409 CART_CONFLICT_SINGLE_SHOP` on cross-shop add |
| `DELETE /cart/items/{itemId}` | CUSTOMER | → `{ cart }` | quantity 0 removes line |
| `DELETE /cart` | CUSTOMER | → `{ ok: true }` | |
| `POST /cart/validate` | CUSTOMER | → `{ cart, pricing, issues[] }` | Server re-price; checkout precondition |

### 9.5 Endpoint Map — Orders & Payments
| Method & Path | Role | Request → `data` | Notes |
| :--- | :--- | :--- | :--- |
| `POST /orders` ⚠ | CUSTOMER | `{ addressId, paymentMethod, specialInstructions? }` → `{ order, payment? }` | Validates cart, shop status, campus; generates PIN; enqueues `order-timeout`; publishes `order.placed` |
| `GET /orders` | CUSTOMER | `?status&cursor` → `{ orders[], nextCursor }` | Cursor pagination (created_at,id) |
| `GET /orders/{id}` | CUSTOMER (owner) / SHOP (tenant) | → `{ order, items, history[] }` | |
| `POST /orders/{id}/cancel` | CUSTOMER | `{ reason }` → `{ order }` | Only from `PLACED`, within 120 s window; refund if paid |
| `POST /payments/upi-intent` ⚠ | CUSTOMER | `{ orderId }` → `{ intentUrl, gatewayOrderId, expiresAt }` | Razorpay order; UPI deep link works on web + RN |
| `POST /payments/{orderId}/cod` ⚠ | CUSTOMER | → `{ payment }` | COD allowed only if `totalPaise ≤ config.codMaxPaise` |
| `POST /webhooks/razorpay` | gateway | raw body + `X-Razorpay-Signature` | HMAC verify → lock → idempotent apply (Section 13.3) |

### 9.6 Endpoint Map — Shop Operations (tenant = session.shopId)
| Method & Path | Role | Request → `data` | Notes |
| :--- | :--- | :--- | :--- |
| `GET /shop/orders` | SHOP_OWNER/STAFF | `?status` → `{ orders[] }` | Live queue; SSE topic `shop:{id}:orders` preferred |
| `POST /shop/orders/{id}/accept` | SHOP_OWNER/STAFF | `{ prepTimeMinutes? }` → `{ order }` | Cancels `order-timeout` job |
| `POST /shop/orders/{id}/reject` | SHOP_OWNER/STAFF | `{ reason }` → `{ order }` | Auto-refund if paid |
| `POST /shop/orders/{id}/status` | SHOP_OWNER/STAFF | `{ toStatus }` → `{ order }` | State machine enforced (Section 10) |
| `POST /shop/orders/{id}/verify-pin` ⚠ | SHOP_OWNER/STAFF | `{ pin }` → `{ order }` | Only path to `DELIVERED`; constant-time compare; 5 attempts |
| `PATCH /shop/profile` | SHOP_OWNER | `{ deliveryFeePaise?, minOrderForFreeDeliveryPaise?, prepTimeMinutes?, upiVpa? }` → `{ shop }` | Audit-logged |
| `POST /shop/status` | SHOP_OWNER | `{ isOpen? , snoozeMinutes? }` → `{ shop }` | Write-through to Redis hash; enqueues `snooze-wake` |
| `GET/POST /shop/categories` + `PATCH/DELETE /shop/categories/{id}` | SHOP_OWNER | CRUD | Bumps menu cache version |
| `GET/POST /shop/items` + `PATCH/DELETE /shop/items/{id}` | SHOP_OWNER | CRUD incl. `isAvailable` toggle | Bumps menu cache version |

### 9.7 Endpoint Map — Support, Admin, Events, Health
| Method & Path | Role | Request → `data` | Notes |
| :--- | :--- | :--- | :--- |
| `POST /support/tickets` | CUSTOMER | `{ orderId?, subject, message }` → `{ ticket }` | |
| `GET /support/tickets` | CUSTOMER / QUERY_RESOLVER | scoped list | Resolver sees campus scope only |
| `PATCH /support/tickets/{id}` | QUERY_RESOLVER | `{ status, resolutionNotes }` → `{ ticket }` | Audit-logged |
| `POST /support/orders/{id}/resolve-pin` | QUERY_RESOLVER | → `{ order }` | Manual `DELIVERED` override for `PIN_LOCKED`; audit-logged |
| `GET/POST /admin/campuses` + `PATCH /admin/campuses/{id}` | SUPER_ADMIN | CRUD | Invalidates `gb:geo:campuses` |
| `GET/POST /admin/shops` + `PATCH /admin/shops/{id}` | CAMPUS_ADMIN | campus-scoped CRUD | Includes `commissionPct` (SUPER_ADMIN only) |
| `GET/PATCH /admin/config` | CONFIG_CHANGER | platform params (caps, fees, `codMaxPaise`, surge) | Stored config table + Redis cached 60 s |
| `GET /admin/audit-logs` | SUPER_ADMIN | `?actorId&entity&cursor` | |
| `POST /devices` | any authed | `{ platform, expoPushToken }` → `{ ok: true }` | Upserts `device_tokens` (Phase 9 uses; harmless now) |
| `GET /events/stream?topics=order:{id},shop:{id}:orders` | authed | SSE stream | Section 11; topic authz enforced |
| `GET /api/health/live` | public | `{ ok: true }` | Process up |
| `GET /api/health/ready` | public | `{ postgres: bool, redis: bool }` | Used by LB/compose healthchecks |

---

## 10. Order State Machine & Shop Self-Delivery Workflow

### 10.1 State Machine (the ONLY legal transitions — enforced in `packages/core/orderMachine.ts`)
| From | To | Actor | Guard / Side Effects |
| :--- | :--- | :--- | :--- |
| — | `PLACED` | CUSTOMER | Cart validated; PIN generated; `order-timeout` job (10 min); event `order.placed` |
| `PLACED` | `ACCEPTED` | SHOP | Cancels timeout job; sets `estimated_delivery_time`; event `order.accepted` |
| `PLACED` | `CANCELLED` | CUSTOMER | Only within 120 s of placement; refund if paid |
| `PLACED` | `CANCELLED` | SHOP / SYSTEM | Reject reason or timeout job; refund if paid |
| `ACCEPTED` | `PREPARING` | SHOP | event `order.preparing` |
| `ACCEPTED` | `CANCELLED` | SHOP | Mandatory reason; refund if paid; QUERY_RESOLVER notified |
| `PREPARING` | `OUT_FOR_DELIVERY` | SHOP | SMS/push to student: "arriving at gate" |
| `OUT_FOR_DELIVERY` | `DELIVERED` | SHOP | **Requires valid 4-digit PIN** (`verify-pin`); sets `delivered_at` |
| `OUT_FOR_DELIVERY` | `DISPUTED` | CUSTOMER | Opens support ticket automatically |
| `DELIVERED` | `DISPUTED` | CUSTOMER | Within 6 h; QUERY_RESOLVER queue |
| `DISPUTED` | `DELIVERED` / `CANCELLED` | QUERY_RESOLVER | Resolution; refund decision; audit-logged |

Illegal transition → `409 ORDER_INVALID_STATE`. Every legal transition is written to `order_status_history` in the **same DB transaction** as the status update, then published to Redis Pub/Sub (Section 11) after commit.

### 10.2 Shop Self-Delivery Workflow & Verification
Because shops handle their own deliveries without platform riders:

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Student (Customer)
    participant App as Next.js Core
    participant DB as Postgres
    actor Shop as Shop Staff

    Customer->>App: Places Order (UPI / COD)
    App->>DB: Status: PLACED, Generates Delivery PIN (e.g. 7492)
    App->>Shop: Instant Audio Alert / Socket Push
    Shop->>App: Accepts Order -> Status: ACCEPTED
    Shop->>App: Prepares Food -> Status: PREPARING
    Shop->>Customer: Staff walks to Hostel Gate -> Status: OUT_FOR_DELIVERY
    Customer-->>Shop: Meets at Hostel Gate & provides Delivery PIN "7492"
    Shop->>App: Enters PIN "7492" in Shop Portal
    App->>DB: Validates PIN match
    DB-->>App: PIN Correct!
    App->>DB: Status: DELIVERED, timestamp recorded
    App->>Customer: Order Completed & Star Rating Prompt
```

### 10.3 The Delivery PIN Safeguard
1. When the order is placed, an unguessable 4-digit PIN (`LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0')`) is generated.
2. The PIN is **only visible on the student's active order screen** (and RN order screen later — same API field).
3. The shop dashboard contains an input field: `[ Enter Delivery PIN ]`.
4. The shop **cannot** mark the order as `DELIVERED` without this PIN. This completely eliminates fake delivery disputes.
5. Senior additions: comparison is constant-time; attempts are counted in Redis (`gb:rl:pin:{orderId}`, 5 attempts / 15 min) → exhaustion locks the order (`PIN_LOCKED`) and routes to QUERY_RESOLVER; PIN is never logged (Section 16.2 redaction).

---

## 11. Real-Time Event Architecture (SSE + Redis Pub/Sub → FCM)

### 11.1 Design
- **Transport (web):** Server-Sent Events at `GET /api/v1/events/stream?topics=...` — one connection per client, heartbeats every 25 s, auto-reconnect with `Last-Event-ID`.
- **Backbone:** Redis Pub/Sub channels (Section 7.1 #14–16). After every committed state change, `packages/core` calls `EventBus.publish(channel, event)`; the SSE route subscribes and fans out. Web is stateless — any replica can serve any stream because Redis is the meeting point.
- **Fallback:** if SSE fails (hostel firewalls/proxies), clients poll `GET /orders/{id}` every 15 s. RN (Phase 9) uses polling + FCM push instead of SSE — **event payload schema is transport-independent and frozen below.**

### 11.2 Topic Authorization
| Topic | Subscriber must be |
| :--- | :--- |
| `order:{orderId}` | The order's customer, or staff of the order's shop |
| `shop:{shopId}:orders` | SHOP_OWNER/STAFF with matching `session.shopId` |
| `campus:{campusId}` | Any session with `activeCampusId == campusId` |

### 11.3 Event Envelope (frozen — RN depends on this)
```jsonc
{
  "id": "evt_01J...",
  "topic": "order:9f1c...",
  "type": "order.status_changed",      // order.placed|accepted|preparing|out_for_delivery|delivered|cancelled
  "orderId": "9f1c...",
  "orderNumber": "GB-BIH-10492",
  "status": "PREPARING",
  "occurredAt": "2026-09-24T12:01:00.000Z"
}
```
Shop feed additionally emits `order.incoming` (triggers the dashboard audio bell). Campus channel emits `campus.banner` (CAMPUS_ADMIN announcements) and `shop.status_changed`.

### 11.4 NotificationProvider Interface (push-ready seam)
```ts
// packages/core/src/notifications/provider.ts — implemented now, RN plugs in later
export interface NotificationProvider {
  sendSms(phone: string, template: string, vars: Record<string, string>): Promise<void>;
  sendPush(userId: string, template: string, vars: Record<string, string>): Promise<void>;
}
// Phase 1-8: Fast2SmsProvider implements sendSms; sendPush is a no-op stub.
// Phase 9: ExpoPushProvider implements sendPush via device_tokens. No core code changes.
```

---

## 12. Fast2SMS Notification & OTP Architecture

### 12.1 Authentication & Rate Limiting Engine (Redis-enforced)
```mermaid
flowchart TD
    Req["User Requests OTP"] --> RateLimit{"Redis: gb:otp:cooldown:{phone} exists?"}
    RateLimit -- "Yes" --> Deny["429 AUTH_OTP_COOLDOWN + retryAfterSec"]
    RateLimit -- "No" --> LockCheck{"Redis: gb:otp:lockout:{phone} exists?"}
    LockCheck -- "Yes" --> Block["423 AUTH_OTP_LOCKED (1 hr)"]
    LockCheck -- "No" --> HourlyCheck{"INCR gb:otp:attempts:{phone} > 4?"}
    HourlyCheck -- "Yes" --> SetLock["SET lockout 1h"] --> Block
    HourlyCheck -- "No" --> Gen["Generate 6-digit CSPRNG OTP"]
    Gen --> Store["Store argon2id(OTP + OTP_PEPPER) in otps table, 5-min expiry"]
    Store --> Queue["Enqueue BullMQ sms-otp job"] --> Cool["SET gb:otp:cooldown 60s NX EX"]
    Cool --> Fast2SMS["Worker calls Fast2SMS API (DLT route)"]
```
Verify path: fetch latest unused OTP → constant-time hash compare → on success mark `is_used`, delete cooldown/attempt keys, create session (Section 6.1). 5 bad verifies on one OTP invalidate it.

### 12.2 Fast2SMS Request Implementation
```ts
// packages/core/src/notifications/fast2sms.ts
export async function sendOtpSms(phone: string, otp: string) {
  const url = "https://www.fast2sms.com/dev/bulkV2";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: process.env.FAST2SMS_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      variables_values: otp,
      route: "otp",
      numbers: phone,
    }),
    signal: AbortSignal.timeout(8_000), // worker-level timeout; job retries handle failure
  });
  return response.json();
}
```
Rules: OTP SMS is **only** sent from the `sms-otp` BullMQ worker (never inline in the request path — keeps `/auth/otp/request` p95 < 300 ms); every send writes a `notification_logs` row; Fast2SMS non-200 or `{return:false}` throws → job retry (3 attempts, exponential backoff) → DLQ emits Sentry alert. DLT-registered sender ID and template IDs live in env/config, not code.

---

## 13. Payments & Webhook Security (Razorpay)

### 13.1 Methods & Rules
1. **UPI_INTENT (primary):** `POST /payments/upi-intent` creates a Razorpay order → returns `intentUrl` (`upi://pay?...`). Deep link opens GPay/PhonePe on phones; on desktop the UI shows QR + intent button. Same payload works for RN later (`Linking.openURL`).
2. **CASH_ON_DELIVERY:** permitted only when `totalPaise ≤ config.codMaxPaise` (CONFIG_CHANGER tunable, default ₹500). PIN verification still mandatory.
3. **CAMPUS_WALLET:** schema-reserved only — no implementation before Phase 8, no UI exposure.

### 13.2 Money Invariants (ADR-005)
- DB stores `DECIMAL(10,2)` INR; API contracts carry integer `*_paise`; single conversion point `toPaise()/fromPaise()` in `packages/types`.
- `items_subtotal + delivery_fee + platform_fee + tax_fee == total_amount` is asserted by a DB CHECK and re-verified in the order service.
- `order_items.total_price == unit_price * quantity` per row.

### 13.3 Webhook Pipeline (exact handler order — normative)
```ts
// POST /api/v1/webhooks/razorpay — must remain under 5s
1. Read RAW body (no JSON middleware mutation) 
2. Verify HMAC-SHA256 signature with RAZORPAY_WEBHOOK_SECRET → mismatch: 400 + security log, no retry invite
3. Parse event; extract event id
4. withLock(`webhook:${event.id}`, 30s) {           // Redis distributed lock
     if (await idemExists(`webhook:${event.id}`)) return 200;  // exact-once
     switch (event.type) {
       case "payment.captured": markPaymentCaptured(); break;  // order stays in flow; notify shop channel
       case "payment.failed":  markPaymentFailed();   break;  // order auto-cancels; cart restored
     }
     await idemSet(`webhook:${event.id}`, processedAt);        // 24h
   }
5. Respond 200 ALWAYS for verified events (even unknown types — log & ignore)
```
### 13.4 Reconciliation (belt-and-braces for missed webhooks)
BullMQ `payment-reconcile` repeatable job every 5 min: fetch payments `PENDING` older than 10 min → Razorpay Orders API → apply terminal state → emit events. Students see `PAYMENT_PENDING` UI with a manual "I've paid" refresh button hitting `POST /payments/upi-intent` refresh path (idempotent, rate-limited 3/min).

### 13.5 Refunds & Settlements
- Refunds are initiated only by system paths (shop reject, timeout cancel) or QUERY_RESOLVER (`REFUND_ISSUED` audit entry, amount + reason in metadata).
- Shop settlements: weekly batch report from captured payments minus `commission_pct` (CSV from admin console in Phase 6; RazorpayX payouts are a post-launch ADR, not in this build).

---

## 14. Frontend UI / Figma Alignment (`YumQuick`)

### 14.1 Design Tokens (Extracted directly from Figma Node `1:423` via Figma MCP)
* **Primary Accent:** `#E95322` (`Orange Base`)
* **Secondary Tint:** `#FFDECF` (`Orange Light`)
* **Dark Contrast Font:** `#391713`
* **Light Contrast Font:** `#F8F8F8`
* **Card & Canvas Background:** `#FFFFFF` / `#FAFAFA`
* **Font Family:** `League Spartan`, sans-serif

Tokens are defined **once** in `packages/config/tokens.ts` and consumed by: Tailwind theme (web) now, NativeWind theme (RN) in Phase 9. Agents must re-pull from Figma MCP before styling each screen rather than eyeballing screenshots.

```ts
// packages/config/src/tokens.ts (shape — values from Figma)
export const tokens = {
  colors: {
    orangeBase: "#E95322",
    orangeLight: "#FFDECF",
    fontDark: "#391713",
    fontLight: "#F8F8F8",
    canvas: "#FAFAFA",
    card: "#FFFFFF",
  },
  fonts: { display: "League Spartan", body: "League Spartan" },
  radius: { card: 16, button: 12, pill: 999 },
} as const;
```

### 14.2 Responsive Architecture: Desktop vs Mobile

```text
========================================================================================
DESKTOP VIEWPORT (>= 1024px) - Clean 3-Column Command Canvas
========================================================================================
[ Topbar: Logo "Go-Bite" | Campus Dropdown [IIT Patna - Bihta ▼] | Search | User Profile ]
----------------------------------------------------------------------------------------
[ LEFT COLUMN: 240px   ] [ CENTER COLUMN: Fluid Flex-1        ] [ RIGHT COLUMN: 360px  ]
- Campus Categories     | - Shop Banner & Operating Status    | - Sticky Live Cart     ]
  • Canteens & Meals    | - Search & Veg/Non-Veg Filter       | - Subtotal & Breakdown ]
  • Night Mess          | - Responsive 3-Column Item Cards    | - Delivery Address     ]
  • Campus Salon        |   [ Image | Name | Price | +ADD ]   |   (Hostel C, Rm 204)   ]
  • Stationery / Print  |   [ Image | Name | Price | +ADD ]   | - Place Order Button   ]
- Active Orders Tracker |   [ Image | Name | Price | +ADD ]   | - Live PIN Display     ]
========================================================================================

========================================================================================
MOBILE VIEWPORT (< 1024px) - Native App Experience
========================================================================================
[ Header: Campus Tag [IIT Patna ▼]                [Search] [Profile Icon] ]
[ Horizontal Scrollable Story Categories: Food | Salon | Laundry | Mess   ]
[ Banner Carousel: Late Night Deliveries Active Until 3:00 AM             ]
[ Vendor Cards & Food Grids (Single / Dual Column)                        ]
----------------------------------------------------------------------------------------
[ STICKY BOTTOM BAR: 2 Items in Cart • ₹140 | [ VIEW CART & CHECKOUT -> ] ]
[ BOTTOM NAVIGATION: [ Home ] [ Orders (Live PIN) ] [ Support ] [ Profile] ]
========================================================================================
```

### 14.3 Component & UX Rules
1. shadcn/ui primitives only; no new component libraries.
2. The mobile web layout is the **visual reference for the RN app** — every mobile-web screen must be decomposable into RN primitives (`View`/`Text`/`FlatList`/`Pressable`); avoid hover-only interactions and web-only gestures.
3. The 4-digit Delivery PIN is the most prominent element on the active-order screen (min 40 px equivalent, high contrast).
4. Shop dashboard: new-order state must trigger an audible bell (`order.incoming` event) that requires one-time user interaction to unlock audio (browser policy) — surface an "Enable sound" nudge.
5. All prices rendered from integer paise via `formatINR(paise)` from `packages/types`.

---

## 15. Security Hardening & Abuse Prevention

### 15.1 Transport & Headers
HTTPS only (HSTS 1y, preload); `CSP` locking scripts to self; `X-Frame-Options: DENY`; `Referrer-Policy: strict-origin-when-cross-origin`; CORS allowlist = app origins only (Phase 9 adds Expo dev origins). Cookies: `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Lax`.

### 15.2 Rate Limit Matrix (Redis sliding window, Section 7.5)
| Bucket | Identifier | Limit |
| :--- | :--- | :--- |
| `otp:request` | phone | 1 / 60 s **and** 4 / hour (then 1 h lockout) |
| `otp:request:ip` | IP | 20 / hour |
| `otp:verify` | phone | 5 / OTP lifetime |
| `orders:place` | userId | 10 / min |
| `pin:verify` | orderId | 5 / 15 min (→ `PIN_LOCKED`) |
| `payments:refresh` | userId | 3 / min |
| `support:create` | userId | 5 / hour |
| `api:global` | IP | 100 / min |

### 15.3 Abuse & Fraud Controls
- **Fake-delivery prevention:** PIN gate (Section 10.3) with constant-time compare + attempt lockout.
- **Order flooding:** per-shop `max_active_orders` config; when exceeded, shop auto-snoozes for 15 min (CONFIG_CHANGER tunable) and customers see a honest "kitchen at capacity" state.
- **COD abuse:** COD disabled for accounts with ≥2 undelivered COD orders (computed in order service).
- **Session theft:** token rotation (Section 6.1), `ip_address`/`user_agent` stored on session, anomaly logs.
- **Tenant probing:** Section 6.3 rules + WARN events feed Sentry alerts.
- **Secrets:** never in repo; `.env.example` documents names only; server env validated at boot by Zod (`packages/config/env.ts`) — the process refuses to start on missing/invalid vars.

### 15.4 Data Protection
Phones/OTP/PIN/payment refs are **redacted from logs** (Section 16.2). `delivery_pin` never appears in API responses for shop roles. Audit trail: every privileged mutation writes `audit_logs` (actor, action, entity, metadata, IP).

---

## 16. Observability, Logging & Error Standards

### 16.1 Structured Logging (pino)
Every request carries `requestId` (UUID, `AsyncLocalStorage`, echoed in response `meta.requestId`). Log shape:
```jsonc
{ "level": 30, "time": 1727092800000, "requestId": "req_01J...", "userId": "u_...",
  "campusId": "...", "route": "POST /api/v1/orders", "status": 201, "durationMs": 182 }
```
Levels: DEBUG (dev), INFO (requests, jobs), WARN (degradations, tenant probes), ERROR (exceptions → also Sentry).

### 16.2 Redaction List (enforced by pino `redact` paths — normative)
`req.headers.authorization`, `req.headers.cookie`, `body.otp`, `body.pin`, `*.delivery_pin`, `*.phone` (log as `sha256(phone).slice(0,10)`), `*.upi_vpa`, `*.transaction_ref`.

### 16.3 Metrics & Alerting
- Counters in Redis (`gb:metrics:{date}:{metric}`): `orders.placed`, `orders.delivered`, `orders.cancelled`, `payments.failed`, `otp.sent`, `otp.locked`, `webhook.replayed`; nightly `metrics-rollup` persists them for the admin dashboard.
- Health: `/api/health/live` (process), `/api/health/ready` (PG `SELECT 1` + Redis `PING`).
- Sentry: 100 % error sampling, 10 % transaction sampling (web + worker). Phase 9: `@sentry/react-native` with the same DSN project.
- Worker liveness: BullMQ queue lag > 100 jobs or oldest waiting job > 5 min → Sentry alert.

---

## 17. Testing Strategy & Quality Gates

### 17.1 Test Pyramid (all run in CI — Section 18.4)
| Layer | Tool | Scope (must-have cases) |
| :--- | :--- | :--- |
| Unit | Vitest | `packages/core`: order state machine (every legal/illegal transition), pricing engine (money invariants), PIN generation/compare, cart single-shop rule, paise conversions. `packages/redis`: rate-limiter Lua, idempotency, lock release-safety (fakeredis) |
| Contract | Zod + OpenAPI diff | Every endpoint schema in `packages/types` snapshot-tested; CI fails if OpenAPI changes without a versioned plan update |
| Integration | Vitest + testcontainers (PG 16 + PostGIS, Redis 7) | OTP request/verify cooldowns, order placement idempotency (same key twice → one order), webhook exact-once (duplicate delivery), tenant isolation (cross-shop mutation → 403/404), cart re-pricing |
| E2E | Playwright | Login (mocked SMS provider), browse campus → add to cart → UPI (mocked gateway) → track → PIN handoff; shop accept→prepare→deliver flow |
| Load | k6 (`infra/scripts/k6/`) | Menu read p95 < 200 ms @ 200 RPS (cache on); order placement p95 < 800 ms @ 20 RPS; SSE fan-out to 500 concurrent streams |

### 17.2 Quality Gates (block merge)
`pnpm lint` (0 errors) · `pnpm typecheck` (strict, 0 errors) · `pnpm test` (all green) · coverage ≥ 70 % lines on `packages/core` + `packages/redis` · `drizzle-kit check` (migration drift) · Playwright suite green on `main` · no `console.log` / `any` / `@ts-ignore` in diff (ESLint rules).

### 17.3 Test Data
Seeds (`packages/db/seed.ts`) create deterministic fixtures: 3 campuses, 6 shops across service types, 40+ catalog items, demo users per role (`+919000000001` … documented), and a `TEST_OTP=123456` bypass that is hard-disabled when `NODE_ENV=production` (boot-time assertion).

---

## 18. DevOps: Docker, Environments & CI/CD

### 18.1 Local Infra (`infra/docker-compose.yml`)
```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4
    environment: { POSTGRES_DB: gobite, POSTGRES_USER: gobite, POSTGRES_PASSWORD: gobite }
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U gobite"], interval: 5s, retries: 10 }
  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes", "--appendfsync", "everysec", "--maxmemory", "512mb", "--maxmemory-policy", "allkeys-lru"]
    ports: ["6379:6379"]
    volumes: ["redisdata:/data"]
    healthcheck: { test: ["CMD", "redis-cli", "ping"], interval: 5s, retries: 10 }
volumes: { pgdata: {}, redisdata: {} }
```

### 18.2 pnpm Scripts (root, normative)
`pnpm dev` (turbo: web + worker) · `pnpm infra:up|down` (compose) · `pnpm db:generate|migrate|seed` · `pnpm test|test:integration|test:e2e` · `pnpm lint|typecheck|build` · `pnpm k6:smoke`.

### 18.3 Environments
| Env | Purpose | Notes |
| :--- | :--- | :--- |
| `local` | dev machine | docker-compose infra; `TEST_OTP` bypass on |
| `staging` | pre-prod on VPS | Real Fast2SMS/Razorpay **test** keys; seeded campuses |
| `production` | live | Self-hosted VPS (Docker): `web` ×N, `worker` ×1+, Postgres 16, Redis 7 behind private network; nightly `pg_dump` → S3-compatible bucket (30-day retention); Redis AOF volume snapshotted nightly |

### 18.4 CI/CD (GitHub Actions)
- `ci.yml` (every PR): install → lint → typecheck → unit → build → integration (compose services) → OpenAPI diff check.
- `e2e.yml` (main + nightly): Playwright against ephemeral stack.
- `deploy.yml` (tag `v*`): build images → push → SSH deploy to VPS (`docker compose up -d --build web worker`) → run `drizzle-kit migrate` as a one-shot job → smoke-check `/api/health/ready`.
- Dependabot weekly; secrets in GitHub Environments; branch protection requires green CI + 1 approval (even for agents).

---

## 19. Environment Variables Reference (`.env.example` mirrors this exactly)

| Var | Used By | Example / Notes |
| :--- | :--- | :--- |
| `NODE_ENV` | all | `development` / `production` |
| `APP_URL` | web | `https://gobite.in` (webhook + UPI callback base) |
| `DATABASE_URL` | db, web, worker | `postgres://gobite:***@host:5432/gobite` |
| `REDIS_URL` | redis, web, worker | `redis://default:***@host:6379` |
| `BETTER_AUTH_SECRET` | web | 32-byte hex |
| `BETTER_AUTH_URL` | web | same as APP_URL in prod |
| `OTP_PEPPER` | core | server-side OTP hash pepper |
| `TEST_OTP_ENABLED` | core | `true` only outside production |
| `FAST2SMS_API_KEY` | worker | from Fast2SMS dashboard |
| `FAST2SMS_SENDER_ID` / `FAST2SMS_TEMPLATE_ID` | worker | DLT-registered |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | web, worker | test keys on staging |
| `RAZORPAY_WEBHOOK_SECRET` | web | HMAC verification |
| `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | web, worker | one project; RN reuses in Phase 9 |
| `CORS_ALLOWED_ORIGINS` | web | comma-separated |
| `PLATFORM_FEE_PCT` / `COD_MAX_PAISE` | core | defaults; CONFIG_CHANGER overrides via `/admin/config` |
| `LOG_LEVEL` | all | `info` prod / `debug` dev |
| `EXPO_ACCESS_TOKEN` | worker (Phase 9) | Expo Push service |

Boot-time Zod validation (`packages/config/env.ts`) — missing/invalid var ⇒ process exits non-zero with a named error.

---

## 20. Agent Execution Guardrails & Coding Conventions

### 20.1 File & Naming Conventions
- Files: `kebab-case.ts(x)`; components `PascalCase`; functions/vars `camelCase`; constants `SCREAMING_SNAKE`; DB columns `snake_case`; API fields `camelCase`; Redis keys via `keys.ts` builders only.
- Route Handler template (mandatory shape):
```ts
// apps/web/app/api/v1/orders/route.ts
export const POST = withApi({
  roles: ["CUSTOMER"],
  rateLimit: { bucket: "orders:place", by: "userId", limit: 10, windowSec: 60 },
  idempotent: true,                       // enforces Idempotency-Key header
  body: PlaceOrderSchema,                 // from @gobite/types
}, async ({ actor, body }) => ok(await orderService.place(actor, body), 201));
```

### 20.2 Forbidden Patterns (CI linted where automatable)
1. Business logic, SQL, or Redis calls inside route handlers or React components.
2. Importing `next/*` or `react/*` from `packages/core|types|redis|db`.
3. Next.js Server Actions for domain mutations (breaks RN parity — ADR-001).
4. Floating-point money math anywhere; non-`*_paise` money fields at API boundary.
5. `KEYS` / `FLUSHALL` / unbounded `SCAN` against Redis; raw Redis key strings outside `keys.ts`.
6. `Date.now()`-based expiry logic where Redis TTL/Postgres `expires_at` exists.
7. Silently swallowing errors (`catch {}`); every catch logs with `requestId` and rethrows or maps to an envelope error.
8. New env var, endpoint, table, or Redis key without updating the matching section of this plan in the same PR.

### 20.3 PR Definition of Done (per task)
- [ ] Implements exactly the planned contract (paths, fields, codes verbatim)
- [ ] Zod schemas added to `packages/types` first; OpenAPI regenerated
- [ ] Unit + (where applicable) integration tests; gates in 17.2 pass
- [ ] Audit-log entries for privileged mutations
- [ ] Metrics counters incremented for domain events
- [ ] Commit message: `type(phase-N): description`

---

## 21. Phased Implementation Roadmap (with Definition of Done)

> Execute strictly in order. Each phase ends only when its DoD checkboxes pass.

### Phase 0 — Monorepo & Tooling Bootstrap
- Turborepo + pnpm workspace; `apps/web` (Next.js 15, TS strict, Tailwind 4), `apps/worker` skeleton, `packages/{types,core,db,redis,api-client,config}` skeletons
- ESLint flat config + boundaries plugin (Section 3.2 rules), Prettier, Husky, lint-staged
- `infra/docker-compose.yml` (Postgres+PostGIS, Redis 7 per Section 18.1); `packages/config/env.ts` Zod boot validation
- GitHub Actions `ci.yml` running lint/typecheck/build
- **DoD:** `pnpm infra:up && pnpm dev` boots web+worker; CI green on empty scaffold; invalid env crashes boot with named error

### Phase 1 — Database & Core Foundation
- drizzle-kit schema for full DDL (Section 8) + RLS policies (Section 6.3) + migrations
- Seeds: campuses `IIT Patna (Bihta)`, `IIT Kanpur`, `NIT Patna`; demo shops/users/items (Section 17.3)
- `packages/redis`: client, keys, `cached()`, `withLock()`, rate-limiter Lua, idempotency helpers — with unit tests
- **DoD:** `pnpm db:migrate && pnpm db:seed` idempotent; Redis helper test coverage ≥ 70 %; `GEOSEARCH` resolves seeded campuses

### Phase 2 — Authentication & RBAC Layer
- Better Auth phone-OTP with **Redis secondaryStorage**; dual cookie+bearer issuance; `POST /auth/otp/*` endpoints
- Fast2SMS via `sms-otp` BullMQ worker; Redis cooldown/lockout exactly per Section 12.1
- `withApi` middleware: session → `ActorContext` → `requireRole`; route protection for `/admin/*`, `/shop/*`, `/support/*`, `/app/*`
- **DoD:** Integration tests prove cooldown (`AUTH_OTP_COOLDOWN`), 4/hr lockout, constant-time verify, bearer-token session works without cookies; logout revokes instantly via Redis

### Phase 3 — Redis Domain Services & Realtime Backbone
- Server-side cart (`/cart/*`) with single-shop conflict + validate/re-price
- Catalog cache (campus shops, shop menu) with version invalidation; shop live-status hash write-through
- `EventBus` on Redis Pub/Sub + `GET /events/stream` SSE with topic authz; campus geo index + hourly `geo-refresh`
- Queues: `order-timeout`, `snooze-wake`, `notifications` (logging only for now)
- **DoD:** Integration: two concurrent adds → `CART_CONFLICT_SINGLE_SHOP`; menu mutation invalidates cache (new version served ≤1 s); SSE client receives `order.status_changed` within 500 ms of commit; Redis-down behavior matches Section 7.8

### Phase 4 — Shop & Menu Management (Self-Delivery Hub)
- Shop dashboard: menu CRUD, availability toggles, open/close + snooze (with `snooze-wake`), delivery fee config
- Live order queue on SSE + audible bell; accept/reject/status transitions; **Delivery PIN modal** with attempt lockout
- **DoD:** State machine tests all pass; PIN flow E2E (wrong PIN ×5 → `PIN_LOCKED` → resolver override); snooze reflects in catalog API ≤ 1 s; audit rows written for every privileged action

### Phase 5 — Customer Experience (Figma Replicated)
- Desktop 3-column & mobile layouts per Section 14 (tokens via `packages/config`, League Spartan, `#E95322`)
- Campus selector + geofence resolution; address builder (hostel/block/room/gate)
- Checkout: cart validate → order place with `Idempotency-Key`; tracking screen (Figma node `240:3971`) on SSE with prominent PIN
- **DoD:** Playwright happy path green; double-click place-order yields exactly one order; Lighthouse mobile ≥ 90; menu read p95 < 200 ms under k6 cache-on load

### Phase 6 — Payments, Admin & Support
- Razorpay UPI intent + signed webhook pipeline (exact-once, Section 13.3) + `payment-reconcile` worker; COD rules
- Admin console: campus/shop CRUD, commission splits, config editor, audit-log viewer; Support desk with ticket + PIN-override flows
- **DoD:** Duplicate webhook delivery → single state change; missed-webhook order reconciled ≤ 5 min; refund path issues gateway refund + audit entry; support desk scoped per campus

### Phase 7 — Multi-Vertical Add-ons (Salon & Beyond)
- Duration & slot booking for `SALON_GROOMING`; laundry itemized/weight pricing; printout document upload (S3-compatible storage, virus-scan stub, 10 MB cap)
- **DoD:** New verticals reuse the same order state machine with zero schema forks; slot conflicts rejected with `ORDER_INVALID_STATE`-family code

### Phase 8 — Hardening & Launch
- k6 load suite at Section 17.1 targets; Redis/Postgres failover drills per Section 7.8; backup/restore rehearsal; security review against Section 15; `TEST_OTP` disabled; Sentry dashboards + alert rules live
- **DoD:** All load targets met; restore drill < 30 min; zero criticals from security checklist

### Phase 9 — React Native App (Expo) — FUTURE, enabled by this plan
- Scaffold `apps/mobile` (Expo SDK 52+, NativeWind, expo-secure-store, expo-notifications, TanStack Query, Zustand)
- Consume `packages/api-client` + `packages/types` verbatim; bearer auth from Phase 2; cart/orders/events from same `/api/v1`
- `ExpoPushProvider` implements `sendPush`; `POST /devices` registers tokens; UPI intents via `Linking`
- **DoD:** Feature parity for CUSTOMER role (browse → cart → pay → track → PIN) with zero backend changes

---

## 22. Architecture Decision Records (ADRs)

### ADR-001: API-first monorepo over Server Actions
**Context:** Product will convert to a React Native app after web launch.
**Decision:** Turborepo monorepo; all mutations through versioned REST `/api/v1`; business logic in framework-free `packages/core`; contracts in `packages/types` (Zod → OpenAPI).
**Consequences:** RN becomes a thin new client; slight upfront cost of maintaining route handlers instead of colocated server actions. Revisit only if mobile strategy is abandoned.

### ADR-002: Redis as the hot-state layer
**Context:** OTP throttling, sessions, carts, live shop status, rate limiting, order events, and background jobs all need fast, ephemeral, shared state; web tier must stay stateless for scale-out.
**Decision:** Single Redis 7 instance (AOF) for cache + Better Auth secondaryStorage + cart + rate limits + idempotency + locks + Pub/Sub + BullMQ, behind `packages/redis` with a normative key schema (Section 7.1).
**Consequences:** One infra dependency with an explicit degradation doctrine (Section 7.8); Postgres remains the source of truth for anything financial or auditable.

### ADR-003: Better Auth dual-credential sessions
**Context:** Web wants httpOnly cookies; RN needs bearer tokens; instant revocation needed for lost phones.
**Decision:** Better Auth with phone-OTP, Redis secondaryStorage, cookie (web) + bearer (mobile) accepted by one middleware.
**Consequences:** One auth codebase serves both clients; session revocation is a Redis `DEL`.

### ADR-004: SSE + Redis Pub/Sub now, FCM push later
**Context:** Live order tracking and shop alerts need realtime; native app comes later.
**Decision:** SSE transport for web with Redis Pub/Sub fan-out; frozen transport-independent event envelope (Section 11.3); `NotificationProvider` seam with Expo Push implementation deferred to Phase 9.
**Consequences:** No Socket.IO dependency; RN reuses payloads verbatim; SSE-through-proxy issues mitigated by 15 s polling fallback.

### ADR-005: Money representation
**Context:** Float arithmetic causes billing bugs; SQL readability matters for ops.
**Decision:** DB columns `DECIMAL(10,2)` INR; API boundary integer `*_paise`; single conversion helpers in `packages/types`; DB CHECK + service assertion on sum invariants.
**Consequences:** One explicit conversion point; contracts are integer-safe for RN.

### ADR-006: Shop self-delivery with 4-digit PIN
**Context:** No platform riders; fake-delivery disputes are the top fraud vector in campus logistics.
**Decision:** Delivery completes only via customer-supplied PIN (`verify-pin`), constant-time compare, 5-attempt Redis lockout → QUERY_RESOLVER override with audit trail.
**Consequences:** Disputes become evidence-based; shops cannot self-complete orders.

### ADR-007: Webhook exact-once processing
**Context:** Razorpay retries webhooks; double-processing corrupts order/payment state.
**Decision:** HMAC verification → Redis distributed lock per event id → 24 h idempotency record → always-200 for verified events, plus 5-min reconciliation poller for missed events.
**Consequences:** At-least-once delivery becomes exactly-once effect; transient Redis loss degrades to reconciliation-path recovery (≤ 5 min).

---

*End of plan.md v2.0. Deviations require a new ADR appended above and human sign-off in the PR.*
