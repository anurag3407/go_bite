# 04 — Redis

> plan.md §7 is normative; this doc is the operator/developer handbook. One Redis 7 instance serves: sessions, cart, cache, rate limits, idempotency, locks, Pub/Sub, and BullMQ. **All access goes through `packages/redis`.**

## 4.1 Instance Configuration
| Env | Command flags |
|:--|:--|
| local (compose) | `redis-server --appendonly yes --appendfsync everysec --maxmemory 512mb --maxmemory-policy allkeys-lru` |
| production | same + AOF, 2 GB maxmemory, private network (no public port), nightly volume snapshot |

Clients: `redis` (commands) and `redisSub` (dedicated subscriber — blocking ops must never share the main pool). `maxRetriesPerRequest: null` (BullMQ requirement).

## 4.2 Key Schema (summary — full table with TTLs in plan.md §7.1)
| Domain | Pattern | Type | TTL |
|:--|:--|:--|:--|
| OTP cooldown / attempts / lockout | `gb:otp:cooldown:{phone}`, `gb:otp:attempts:{phone}`, `gb:otp:lockout:{phone}` | string | 60 s / 1 h / 1 h |
| Session cache | `gb:session:{token}` | hash | 30 d sliding |
| Active campus | `gb:user:{userId}:campus` | string | 24 h |
| Cart | `gb:cart:{userId}` | hash (`shopId,campusId,items,updatedAt`) | 7 d sliding |
| Catalog caches | `gb:cache:campus:{id}:shops:v{ver}`, `gb:cache:shop:{id}:menu:v{ver}` | JSON | 300 s, versioned |
| Shop live status | `gb:shop:{id}:status` | hash | none (write-through) |
| Geo index | `gb:geo:campuses` | GEO | refresh hourly |
| Rate limit | `gb:rl:{bucket}:{identifier}` | ZSET | window |
| Idempotency | `gb:idem:{userId}:{key}` | string → response | 24 h |
| Locks | `gb:lock:{resource}:{id}` | string token | ≤ 30 s |
| Events (Pub/Sub channels) | `gb:events:order:{id}`, `gb:events:shop:{id}:orders`, `gb:events:campus:{id}` | channel | — |
| Metrics | `gb:metrics:{yyyymmdd}:{metric}` | counter | 90 d |
| Queues | `bull:{queue}:*` | BullMQ-managed | — |

**Rule:** build keys only with `packages/redis/src/keys.ts` helpers; literal `"gb:..."` strings elsewhere are lint errors.

## 4.3 Core Helpers (what you use in `packages/core`)
```ts
import { cached, withLock, rateLimit, idempotency, EventBus, keys } from "@gobite/redis";

const shops = await cached(keys.campusShops(campusId, ver), 300, () => loadShops(campusId));
await rateLimit.assert("orders:place", userId, { limit: 10, windowSec: 60 });
const orderId = await idempotency.once(actor.userId, key, () => createOrder());  // replay-safe
await withLock(`webhook:${eventId}`, 30_000, async () => applyEvent());          // exact-once
await EventBus.publish(keys.events.order(orderId), event);                       // post-commit only
```
| Helper | Semantics |
|:--|:--|
| `cached(key, ttl, loader)` | cache-aside + single-flight lock (no stampede) |
| `rateLimit.assert(...)` | atomic Lua sliding window → throws `RATE_LIMITED` + `retryAfterSec` |
| `idempotency.once(user,key,fn)` | first call stores response 24 h; replays return stored body + header |
| `withLock(res, ttl, fn)` | `SET NX PX` + Lua compare-del release; caller handles lock-miss |
| `EventBus.publish/subscribe` | thin Pub/Sub wrapper with JSON envelope (schema → [08-realtime](08-realtime-notifications.md)) |

**Cache invalidation = version bumping:** mutating a shop → `INCR gb:ver:shop:{id}`; readers embed the version in the cache key. No `KEYS`/`SCAN` purges, ever.

## 4.4 Server-Side Cart (deep dive)
- One cart per user, **single-shop rule** → cross-shop add returns `409 CART_CONFLICT_SINGLE_SHOP` + current cart JSON so the UI can offer "Replace?".
- Flow: `PUT /cart/items` → validate item against menu cache → HSET → `EXPIRE 7d` (sliding).
- Checkout: `POST /cart/validate` re-prices every line server-side (client prices are never trusted) → `POST /orders` consumes cart (DEL on success).
- Failure mode: Redis down ⇒ **503 `DEPENDENCY_DOWN`** — carts are never silently dropped.

## 4.5 Rate Limits (Redis-backed; full matrix in [11-security](11-security.md))
Auth buckets fail **closed** when Redis is down; read buckets fail open. Lua script source: `packages/redis/src/lua/ratelimit.lua`.

## 4.6 Pub/Sub vs Persistence
Pub/Sub is fire-and-forget coordination for SSE and shop alerts. The durable record is always `order_status_history` — if Redis or the SSE connection drops, clients recover by polling `GET /orders/{id}` and reading `history[]`.

## 4.7 Operations Runbook
```bash
redis-cli INFO memory            # used_memory_human, fragmentation
redis-cli INFO clients           # connected_clients / blocked
redis-cli --scan --pattern 'gb:cache:*' | head
redis-cli DBSIZE
redis-cli PING                   # health (used by /api/health/ready)
```
Watch: `used_memory` > 80 % maxmemory, `evicted_keys` > 0 with non-LRU-critical data (bump memory), `blocked_clients` spikes (subscriber leak), BullMQ queue lag (→ [10-jobs-workers](10-jobs-workers.md)).

## 4.8 Forbidden Practices
1. Raw key strings outside `keys.ts` 2. `KEYS`/`FLUSH*`/unbounded `SCAN` in app code
3. Storing financial truth only in Redis 4. Second Redis client outside `packages/redis`
5. `Date.now()` expiry logic where a TTL exists 6. Subscriber work on the main connection pool

→ Next: [Auth & RBAC](05-auth-rbac.md)
