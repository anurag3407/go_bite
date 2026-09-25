# 11 — Security

> plan.md §15. Threat model focus: campus payment fraud, fake-delivery disputes, tenant probing, OTP/SMS abuse, session theft.

## 11.1 Transport & Headers
| Header / Setting | Value |
|:--|:--|
| TLS | HTTPS only, HSTS `max-age=31536000; preload` (certbot, see [14-deployment-vps](14-deployment-vps.md)) |
| CSP | scripts `'self'` only; no inline scripts (Next nonce); img from self + CDN |
| Frame / Referrer | `X-Frame-Options: DENY`; `Referrer-Policy: strict-origin-when-cross-origin` |
| Cookies | `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Lax` |
| CORS | allowlist = `APP_URL` (+ Expo origins in Phase 9) via `CORS_ALLOWED_ORIGINS` |
| Body limits | JSON ≤ 256 KB; file uploads (Phase 7) ≤ 10 MB, type-whitelisted |

## 11.2 Rate-Limit Matrix (Redis sliding window — [04-redis](04-redis.md) §4.5)
| Bucket | Identifier | Limit | On breach |
|:--|:--|:--|:--|
| `otp:request` | phone | 1/60 s + 4/hour | 429 then 423 lockout 1 h |
| `otp:request:ip` | IP | 20/hour | 429 `RATE_LIMITED` |
| `otp:verify` | phone | 5 per OTP | OTP invalidated |
| `orders:place` | userId | 10/min | 429 |
| `pin:verify` | orderId | 5/15 min | 423 `PIN_LOCKED` |
| `payments:refresh` | userId | 3/min | 429 |
| `support:create` | userId | 5/hour | 429 |
| `api:global` | IP | 100/min | 429 |

Fail mode: auth/payment buckets **fail closed** (503) when Redis is down; read buckets fail open.

## 11.3 Fraud Controls (business-logic security)
1. **Fake delivery** — completion only via customer PIN: constant-time compare, 5-attempt lock, QUERY_RESOLVER override with mandatory audit note (ADR-006).
2. **Order flooding** — per-shop `max_active_orders` cap → auto-snooze 15 min when exceeded; per-user 10/min placement limit.
3. **COD abuse** — account with ≥2 undelivered COD orders → COD blocked.
4. **Price tampering** — client never supplies prices; checkout re-prices from DB/menu cache ([04-redis](04-redis.md) §4.4).
5. **Duplicate/replay** — `Idempotency-Key` on `POST /orders`, `/payments/*`; webhook exact-once ([09-payments](09-payments.md) §9.3).
6. **Tenant probing** — scoped queries + RLS; probes → WARN + Sentry alert.
7. **OTP harvesting** — cooldown/hourly cap/IP bucket; OTP hashes only (argon2id + `OTP_PEPPER`).

## 11.4 Secrets & Config
- `.env` never committed; `.env.example` lists names only; prod secrets in Docker compose env file on VPS (mode 600) — never in images.
- `packages/config/env.ts` validates at boot; production additionally asserts `TEST_OTP_ENABLED` is not true.
- Rotation: `BETTER_AUTH_SECRET` rotation logs everyone out (sessions invalidated by design); gateway secrets rotated via dashboard + VPS env → rolling restart.

## 11.5 Data Protection
- **Redacted from all logs:** authorization/cookie headers, `otp`, `pin`, `delivery_pin`, raw phone (hash prefix only), `upi_vpa`, `transaction_ref` — enforced by pino `redact` paths ([12-observability](12-observability-logging.md)).
- `delivery_pin` never serialized to SHOP_* roles in any API response.
- PIN never sent via SMS/push (only shown in-app).
- DB backups encrypted at rest by provider volume encryption; offsite copy in S3-compatible bucket.

## 11.6 Audit Trail
Every privileged mutation writes `audit_logs` in the same transaction: `actor_id, actor_role, campus_id, action, entity, entity_id, metadata, ip_address`. Covered actions: config changes, shop snooze/fee edits, refunds, PIN overrides, role/campus onboarding, commission changes. Viewable by SUPER_ADMIN at `GET /admin/audit-logs`.

## 11.7 Security Review Checklist (Phase 8 gate)
- [ ] All Section 15.2 endpoints carry `rateLimit` declarations
- [ ] No endpoint returns another tenant's data (fuzz IDs cross-tenant)
- [ ] Webhook signature fails on tampered body; raw-body path proven by integration test
- [ ] `pnpm audit` — 0 high/critical
- [ ] Headers verified with `curl -I` against staging
- [ ] Log grep for `delivery_pin`/`otp`/`Authorization` returns nothing
- [ ] Production env asserts no test bypasses

→ Next: [Observability & Logging](12-observability-logging.md)
