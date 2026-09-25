# 05 — Authentication, RBAC & Multi-Tenancy

> plan.md §6. Phone-first OTP via Better Auth; **one session model, two credentials** (cookie for web, Bearer for the future RN app).

## 5.1 OTP Login Flow
```mermaid
sequenceDiagram
    participant C as Client (web/RN)
    participant API as /api/v1/auth/otp/*
    participant R as Redis
    participant Q as BullMQ sms-otp
    participant S as Fast2SMS
    C->>API: POST /auth/otp/request {phone}
    API->>R: SET gb:otp:cooldown:{phone} NX EX 60
    alt cooldown exists → 429 AUTH_OTP_COOLDOWN (retryAfterSec)
    API->>R: INCR gb:otp:attempts:{phone} (>4/hr → 1h lockout 423)
    API->>API: CSPRNG 6-digit OTP → argon2id(OTP+OTP_PEPPER) → INSERT otps (5-min expiry)
    API->>Q: enqueue sms-otp job (request returns in <300ms)
    Q->>S: Fast2SMS bulkV2 → notification_logs row
    C->>API: POST /auth/otp/verify {phone, otp, campusId?}
    API->>API: constant-time hash compare (5 bad tries → invalidate OTP)
    API->>API: mark is_used → create session → rotate token
    API-->>C: { user, sessionToken, expiresAt } + Set-Cookie (web)
```
`TEST_OTP_ENABLED=true` (local only) short-circuits the SMS with OTP `123456`; boot-time assertion forbids this flag in production.

## 5.2 Dual Credentials (normative)
| | Web | React Native (Phase 9) |
|:--|:--|:--|
| Transport | `__Host-gb.session` httpOnly/Secure/SameSite=Lax cookie | `Authorization: Bearer <sessionToken>` |
| Storage | browser (invisible) | `expo-secure-store` |
| Issued by | `POST /auth/otp/verify` (same response body) | same endpoint, `sessionToken` field |
| Accepted by | every endpoint — middleware tries cookie **then** Bearer, one code path |

```bash
# web-style
curl -b cookie.txt http://localhost:3000/api/v1/auth/session
# mobile-style
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/auth/session
```

## 5.3 Session Lifecycle
- Better Auth `secondaryStorage` = Redis (`gb:session:{token}`, hash, 30 d sliding; hot read cached 30 s in-process). Postgres `sessions` row is the mirror/audit copy.
- Token rotates on every OTP verify and every 7 days; old token deleted atomically.
- **Revocation = `DEL gb:session:{token}`** (logout endpoint) → next request 401 `UNAUTHORIZED`. Lost-phone case handled instantly, no TTL wait.
- Session payload fields: `userId, role, activeCampusId, shopId?, phoneMasked` → this is how RN knows its campus (no cookie dependency).

## 5.4 Role Matrix (scope of each role)
| Role | Scope | Can do (representative) |
|:--|:--|:--|
| SUPER_ADMIN | all campuses | campus/shop onboarding, commission_pct, audit logs, refunds |
| CAMPUS_ADMIN | one campus | manage its shops, boundary, banners, maintenance snooze |
| CONFIG_CHANGER | campus/global | max active orders, fees, surge, codMaxPaise, hours |
| QUERY_RESOLVER | one campus | disputes, PIN override (`POST /support/orders/{id}/resolve-pin`), cancellations/refunds |
| SHOP_OWNER | one shop | menu CRUD, fees, status/snooze, staff assignment |
| SHOP_STAFF | one shop | live queue, accept/reject/status, verify-pin |
| CUSTOMER | active campus | browse, cart, orders, tracking, tickets |

## 5.5 Enforcement Mechanics
```ts
// packages/core/src/auth/actor.ts — built by withApi, never read sessions in services
export type ActorContext = { userId: string; role: UserRole; campusId?: string; shopId?: string };

// route declaration (apps/web/app/api/v1/shop/orders/[id]/status/route.ts)
export const POST = withApi({ roles: ["SHOP_OWNER", "SHOP_STAFF"], body: StatusSchema },
  ({ actor, body }) => shopOrders.transition(actor, params.id, body.toStatus));
```
1. `withApi` loads session → 401 `UNAUTHORIZED` if absent → `requireRole` → 403 `FORBIDDEN_TENANT` if role mismatch.
2. Every service query scopes by `actor.campusId` / `actor.shopId` (plan §6.3 Drizzle example).
3. RLS on `shops`/`catalog_items`/`orders` as second layer (see [03-database](03-database.md) §3.7).
4. Cross-tenant probes log WARN `security.tenant_probe` with requestId; privileged mutations write `audit_logs`.

## 5.6 Common Errors
| Code | HTTP | Situātion |
|:--|:--|:--|
| `AUTH_OTP_COOLDOWN` | 429 | re-request < 60 s |
| `AUTH_OTP_LOCKED` | 423 | > 4 OTPs/hour/phone |
| `AUTH_OTP_INVALID` / `_EXPIRED` | 401 | wrong code / > 5 min / 5 bad attempts |
| `UNAUTHORIZED` | 401 | missing/expired/revoked session |
| `FORBIDDEN_TENANT` | 403 | valid session, wrong role or wrong shop/campus |

→ Next: [API Reference](06-api-reference.md)
