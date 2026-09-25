# 13 — Testing

> plan.md §17. Quality gates block merges: `lint`, `typecheck`, `test`, coverage ≥70 % on `packages/core`+`redis`, `drizzle-kit check`, Playwright on `main`, OpenAPI diff.

## 13.1 Pyramid & Commands
| Layer | Command | Scope | Runtime |
|:--|:--|:--|:--|
| Unit | `pnpm test` | pure logic in packages (vitest) | seconds |
| Integration | `pnpm test:integration` | API + services vs testcontainers (PG+PostGIS, Redis) | ~1–2 min |
| E2E | `pnpm test:e2e` | Playwright, real browser vs dev stack | ~3–5 min |
| Load | `pnpm k6:smoke` | k6 scripts in `infra/scripts/k6/` | ~2 min |

## 13.2 Must-Have Cases by Domain
**State machine (`packages/core`)** — every legal transition succeeds and writes `order_status_history`; every illegal pair throws `ORDER_INVALID_STATE` (table-driven `it.each` over the plan §10.1 matrix).
**Pricing** — sum invariants, free-delivery threshold, COD cap, paise round-trips (`toPaise(fromPaise(x)) === x`), no float drift across 1000 random carts.
**Cart** — single-shop conflict payload shape; re-price overrides tampered client totals; quantity 0 removes line.
**Redis helpers** — rate limiter blocks at N+1 and allows after window (fake timers + Redis TIME), idempotency replays stored body, lock release only own token, cache-aside single-flight under 50 parallel loaders.
**Auth** — cooldown `AUTH_OTP_COOLDOWN`, hourly lockout, wrong-OTP attempt counter, bearer and cookie sessions both accepted, logout → immediate 401.
**Orders** — double `POST /orders` same Idempotency-Key ⇒ one row (also DB unique), timeout auto-cancel only from `PLACED`, shop reject refunds paid orders.
**Payments** — webhook good signature applies once; duplicate delivery no-ops; tampered body → 400 + zero state change; reconcile picks up stale PENDING.
**Tenant isolation** — shop A token mutating shop B item → 403/404; campus A customer never sees campus B shops.

## 13.3 Integration Harness (testcontainers)
```ts
// packages/core/test/setup.ts — one container set per run, not per test
const pg = await new GenericContainer("postgis/postgis:16-3.4").withExposedPorts(5432).start();
const redis = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();
process.env.DATABASE_URL = `postgres://…:${pg.getMappedPort(5432)}/gobite_test`;
process.env.REDIS_URL = `redis://…:${redis.getMappedPort(6379)}`;
// migrate + seed once per file (globalSetup), truncate tables between tests
```
SMS/gateway always mocked: `MockSmsProvider` (records to array), `MockGatewayProvider` (auto-capture toggle). `TEST_OTP_ENABLED` equivalent flag for tests only.

## 13.4 Playwright Scenarios (critical journeys)
1. **Student happy path:** OTP login → campus auto-resolve → browse → filter veg → add 2 items → cart → address builder → place order (UPI mock) → tracking timeline live → PIN visible → DELIVERED state via shop in second context.
2. **Shop loop:** owner login → menu toggle item unavailable (item vanishes for student without reload) → incoming order bell → accept → prepare → out → PIN entry → delivered; wrong PIN ×5 → lock state visible.
3. **Guards:** cross-shop cart conflict dialog → replace flow; OTP cooldown toast with countdown; customer cancel within 120 s.
Selectors: data-testid attributes (required convention — visual classes are unstable for tests).

## 13.5 Load Targets (k6, exit-code gates in Phase 8)
| Scenario | Target |
|:--|:--|
| Menu read (cache warm) | p95 < 200 ms @ 200 RPS |
| Order placement | p95 < 800 ms @ 20 RPS, error rate < 0.5 % |
| SSE fan-out | 500 concurrent streams, events delivered < 500 ms after publish |

## 13.6 Writing Tests (conventions)
- Files: `*.test.ts` colocated (`unit`) or `test/integration/*.test.ts`.
- Arrange-Act-Assert with no logic in tests; factories in `packages/db/test/factories.ts`.
- Time: `vi.useFakeTimers()` for cooldown/TTL logic — never `setTimeout` sleeps (except one real-Redis boundary test).
- Fixtures reset between tests (`TRUNCATE … CASCADE` order respecting FKs).
- **Coverage gate:** lines ≥ 70 % for `packages/core` + `packages/redis` (vitest `--coverage` config in turbo pipeline).

→ Next: [VPS Deployment](14-deployment-vps.md)
