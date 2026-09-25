# 01 — System Architecture

> Explains plan.md §3–§7. Read this first to understand how a request flows through Go-Bite.

## 1.1 Big Picture

```mermaid
flowchart LR
    subgraph Clients
      Web["Next.js Web (apps/web)"]
      RN["React Native (apps/mobile, Phase 9)"]
    end
    subgraph API["apps/web — Next.js App Router"]
      RH["Route Handlers /api/v1 (thin)"]
      SSE["SSE /api/v1/events/stream"]
      Core["packages/core services"]
    end
    PG[("PostgreSQL 16 + PostGIS<br/>source of truth")]
    RD[("Redis 7<br/>sessions · cart · cache · rate-limit<br/>idempotency · locks · pub/sub · BullMQ")]
    WK["apps/worker (BullMQ consumers)"]
    subgraph External
      F2S["Fast2SMS"] · RZP["Razorpay"] · XP["Expo Push (Phase 9)"]
    end
    Web --> RH
    RN -- "same /api/v1" --> RH
    RH --> Core
    Core --> PG
    Core --> RD
    RD -- "pub/sub" --> SSE --> Web
    WK --> RD
    WK --> F2S
    WK --> XP
    RZP -- "signed webhook" --> RH
```

**Three deployables in production:** `web` (stateless Next.js, horizontally scalable), `worker` (BullMQ consumers, ≥1 replica), and infra (Postgres 16, Redis 7) on a private network behind Nginx. Details → [14-deployment-vps.md](14-deployment-vps.md).

## 1.2 Monorepo Layout

```text
go-bite/
├── apps/
│   ├── web/          # Next.js 15: /app/* /shop/* /admin/* /support/* + app/api/v1/*
│   ├── worker/       # BullMQ workers (sms-otp, notifications, order-timeout, snooze-wake, payment-reconcile, geo-refresh, metrics-rollup)
│   └── mobile/       # (Phase 9, planned) Expo RN — consumes packages/api-client verbatim
├── packages/
│   ├── types/        # Zod schemas + DTOs for EVERY endpoint; money helpers (toPaise/fromPaise); error-code enum
│   ├── core/         # Framework-free business logic: services, order state machine, pricing — never imports next/react/expo
│   ├── db/           # Drizzle schema + migrations/ + seed.ts
│   ├── redis/        # ioredis singleton, keys.ts, cached(), rateLimit, withLock, idempotency, EventBus
│   ├── api-client/   # Typed fetch client used by web AND mobile
│   └── config/       # tokens.ts (design), env.ts (Zod boot validation), constants
├── infra/            # docker-compose.yml, scripts/ (k6, backup)
├── .github/workflows # ci.yml, e2e.yml, deploy.yml
├── docs/             # ← this documentation set
└── plan.md           # binding engineering contract
```

| Package | Responsibility | Hard rule |
|:--|:--|:--|
| `types` | Single source of truth for validation + DTOs | No runtime deps beyond zod |
| `core` | All business rules (state machine, pricing, guards) | Zero `next`/`react`/`expo` imports |
| `db` | Schema, migrations, seeds | Only place with SQL/Drizzle |
| `redis` | Every Redis touchpoint | Raw key strings only in `keys.ts` |
| `api-client` | Typed HTTP calls | Only transport used by clients |
| `config` | Tokens + env validation | Process refuses to boot on invalid env |

## 1.3 Layering Rules (ESLint boundaries-enforced)
1. `apps/*` → may import `packages/*`; never the reverse.
2. Route Handlers are **thin**: `withApi({ roles, rateLimit, idempotent, body })` → service call → envelope. No SQL/Redis/business rules in routes.
3. **All mutations go through `/api/v1`** — Next.js Server Actions are forbidden for domain changes so the future RN app behaves identically.
4. Client fetching only via `packages/api-client` + TanStack Query hooks.

## 1.4 Request Lifecycle (order placement example)
1. Request hits `POST /api/v1/orders` → `withApi` assigns `requestId`, loads session (cookie **or** Bearer) → builds `ActorContext { userId, role, campusId, shopId }`.
2. Rate limit check (`orders:place`, 10/min) via Redis Lua sliding window.
3. `Idempotency-Key` check: `SET gb:idem:{userId}:{key} … NX EX 86400` — replay returns stored response.
4. Zod body validation (`packages/types`).
5. `orderService.place()`: cart re-priced → shop open check (Redis status hash) → money invariants → INSERT order + items + status history in one transaction.
6. Post-commit: publish `order.placed` on `gb:events:order:{id}` + `gb:events:shop:{id}:orders`; enqueue `order-timeout` delayed job; enqueue `notifications` job.
7. Envelope `{ success:true, data:{ order, payment } }` returned (amounts in paise).

## 1.5 State Ownership (where truth lives)
| Kind of state | Owner | Never |
|:--|:--|:--|
| Financial / auditable (orders, payments, audit) | **Postgres** | in Redis |
| Hot & ephemeral (session, cart, status, OTP, limits) | **Redis** (TTL-bound) | as sole record of anything durable |
| Server-state cache on client | TanStack Query | duplicated into Zustand |
| Pure UI state (open modals, selected tab) | Zustand | in URL/server |

## 1.6 Environment Topology
| Env | Web | Worker | Postgres | Redis | Notes |
|:--|:--|:--|:--|:--|:--|
| local | `localhost:3000` | turbo dev | Docker `:5432` | Docker `:6379` | `TEST_OTP_ENABLED=true` |
| staging | VPS path/domain | 1 replica | same VPS | same VPS | Razorpay/Fast2SMS **test** keys |
| production | VPS ×N replicas | 1+ replicas | private, backups nightly | private, AOF + snapshot | real keys |

## 1.7 Design Principles (in priority order)
1. **API-first** — web is just client #1; RN must reuse everything.
2. **Postgres is the source of truth**; Redis makes it fast and coordinates, never owns financial truth.
3. **Fail loudly** — envelope errors, Sentry events, no silent `catch {}`.
4. **Tenant isolation by construction** — campus/shop scope flows through `ActorContext` and RLS.
5. **Integer money** — paise at every boundary (ADR-005).
6. **Stateless web tier** — scale by adding replicas, never sticky sessions.

→ Next: [Getting Started](02-getting-started.md)
